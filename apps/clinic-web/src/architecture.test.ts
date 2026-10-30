import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const root = import.meta.dirname;
function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(file) : /\.tsx?$/.test(file) && !file.includes(".test.") ? [file] : [];
  });
}

// Small, explicit public dependencies. Screens that compose feature UI belong in app/.
const publicDependencies: Record<string, string[]> = {
  patients: [],
  authentication: [],
  appointments: ["patients/api", "patients/form", "patients/hooks"],
  "clinical-builder": ["encounters/api"],
  encounters: ["authentication/auth-provider", "patients/api"],
  nutrition: ["patients/api", "patients/form", "patients/hooks"],
  "owner-cabinet": [
    "appointments/api", "appointments/labels", "authentication/auth-provider",
    "patients/form", "patients/hooks",
  ],
};

const contractOnly = new Set([
  "clinical-builder:encounters/api",
  "encounters:patients/api",
  "nutrition:patients/api",
]);

const dependencies = sourceFiles(root).flatMap((file) => {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const imports: { from: string; to: string; typeOnly: boolean }[] = [];
  function visit(node: ts.Node) {
    let specifier: ts.Expression | undefined;
    let typeOnly = false;
    if (ts.isImportDeclaration(node)) {
      specifier = node.moduleSpecifier;
      const clause = node.importClause;
      typeOnly = Boolean(clause?.isTypeOnly || (
        !clause?.name && clause?.namedBindings && ts.isNamedImports(clause.namedBindings)
        && clause.namedBindings.elements.length && clause.namedBindings.elements.every((item) => item.isTypeOnly)
      ));
    } else if (ts.isExportDeclaration(node)) {
      specifier = node.moduleSpecifier;
      typeOnly = node.isTypeOnly;
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      specifier = node.arguments[0];
    }
    if (specifier && ts.isStringLiteral(specifier)) {
      const spec = specifier.text;
      const target = spec.startsWith("@/") ? path.join(root, spec.slice(2))
        : spec.startsWith(".") ? path.resolve(path.dirname(file), spec) : null;
      if (target) imports.push({
        from: path.relative(root, file).replaceAll("\\", "/"),
        to: path.relative(root, target).replaceAll("\\", "/").replace(/\.[cm]?[jt]sx?$/, ""),
        typeOnly,
      });
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return imports;
});

describe("frontend architecture", () => {
  it("keeps shared independent of features and routing, and retires the old global folders", () => {
    const violations = dependencies.filter(({ from, to }) =>
      /^(components|hooks|lib)\//.test(to)
      || (from.startsWith("shared/") && /^(features|app)\//.test(to)));
    expect(violations).toEqual([]);
  });

  it("keeps feature composition in app and cross-feature imports on explicit public modules", () => {
    const violations = dependencies.filter(({ from, to, typeOnly }) => {
      if (!from.startsWith("features/")) return false;
      if (to.startsWith("app/")) return true;
      if (!to.startsWith("features/")) return false;
      const owner = from.split("/")[1];
      if (owner === to.split("/")[1]) return false;
      const target = to.slice("features/".length);
      return !publicDependencies[owner]?.includes(target)
        || (contractOnly.has(`${owner}:${target}`) && !typeOnly);
    });
    expect(violations).toEqual([]);
  });

  it("has no runtime cycles between features", () => {
    const graph = new Map<string, Set<string>>();
    for (const { from, to, typeOnly } of dependencies) {
      if (typeOnly || !from.startsWith("features/") || !to.startsWith("features/")) continue;
      const owner = from.split("/")[1];
      const target = to.split("/")[1];
      if (owner === target) continue;
      if (!graph.has(owner)) graph.set(owner, new Set());
      graph.get(owner)!.add(target);
    }
    function visit(feature: string, trail: string[]) {
      expect(trail, `Feature cycle: ${[...trail, feature].join(" → ")}`).not.toContain(feature);
      for (const target of graph.get(feature) ?? []) visit(target, [...trail, feature]);
    }
    for (const feature of graph.keys()) visit(feature, []);
  });
});
