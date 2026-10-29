import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import openapiTS, { astToString } from "openapi-typescript";
import ts from "typescript";

const root = new URL("../../../", import.meta.url);
const packageRoot = new URL("../", import.meta.url);
const schemaText = execFileSync("uv", [
  "run", "--directory", "apps/api", "--cache-dir", ".tmp/uv-cache", "--frozen", "python", "-m", "vetdietderm_api.export_openapi",
], { cwd: fileURLToPath(root), encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
const schema = JSON.parse(schemaText);
const types = astToString(await openapiTS(schema, {
  alphabetize: true,
  defaultNonNullable: false,
  transform(schemaObject) {
    if (schemaObject.format === "binary" || (schemaObject.contentMediaType === "application/octet-stream" && !schemaObject.contentEncoding)) {
      return ts.factory.createTypeReferenceNode("Blob");
    }
  },
}));
const outputs = [
  ["openapi.json", JSON.stringify(schema, null, 2) + "\n"],
  ["src/generated.ts", "/** Generated from FastAPI OpenAPI. Run pnpm api:generate; do not edit. */\n" + types],
];
let stale = false;
for (const [name, content] of outputs) {
  const target = new URL(name, packageRoot);
  if (process.argv.includes("--check")) {
    const existing = await readFile(target, "utf8").catch(() => "");
    if (existing.replaceAll("\r\n", "\n") !== content) {
      console.error(`${name} is stale. Run pnpm api:generate and commit the results.`);
      stale = true;
    }
  } else {
    await writeFile(target, content);
    console.log(`Generated ${name}`);
  }
}
if (stale) process.exitCode = 1;
