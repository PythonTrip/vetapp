// Generates src/lib/fediaf-data.ts from the validated FEDIAF 2025 RU JSON database.
//
//   node scripts/generate-fediaf-data.mjs
//
// The output is a self-contained TypeScript module. Runtime code imports that
// module and never parses the full source database on a request or page render.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATABASE_PATH = path.join(root, "docs", "fediaf_2025_veterinary_nutrition_database_ru.json");
const SCHEMA_PATH = path.join(root, "docs", "fediaf_2025_veterinary_nutrition_schema.json");
const OUT = path.join(root, "src", "lib", "fediaf-data.ts");
const validateOnly = process.argv.includes("--validate-only");

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
const database = readJson(DATABASE_PATH);
const schema = readJson(SCHEMA_PATH);

function resolveSchema(node) {
  if (!node?.$ref) return node;
  const prefix = "#/$defs/";
  if (!node.$ref.startsWith(prefix)) throw new Error(`Unsupported schema reference: ${node.$ref}`);
  const resolved = schema.$defs?.[node.$ref.slice(prefix.length)];
  if (!resolved) throw new Error(`Unresolved schema reference: ${node.$ref}`);
  return resolved;
}

function valueType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value === "object" ? "object" : typeof value;
}

/** Validate the JSON-schema features used by the repository's FEDIAF schema. */
function validate(value, schemaNode, location = "$") {
  const node = resolveSchema(schemaNode);
  const allowedTypes = node.type == null ? null : Array.isArray(node.type) ? node.type : [node.type];
  const actualType = valueType(value);
  if (allowedTypes && !allowedTypes.includes(actualType)) {
    throw new Error(`${location}: expected ${allowedTypes.join(" or ")}, got ${actualType}`);
  }
  if (node.const !== undefined && value !== node.const) {
    throw new Error(`${location}: expected constant ${JSON.stringify(node.const)}`);
  }
  if (node.enum && !node.enum.includes(value)) {
    throw new Error(`${location}: value ${JSON.stringify(value)} is not in the schema enum`);
  }
  if (node.format === "uri" && typeof value === "string") {
    try { new URL(value); } catch { throw new Error(`${location}: expected a valid URI`); }
  }
  if (actualType === "array" && node.items) {
    value.forEach((item, index) => validate(item, node.items, `${location}[${index}]`));
  }
  if (actualType !== "object") return;

  for (const key of node.required ?? []) {
    if (!Object.hasOwn(value, key)) throw new Error(`${location}: missing required property ${key}`);
  }
  for (const [key, childSchema] of Object.entries(node.properties ?? {})) {
    if (Object.hasOwn(value, key)) validate(value[key], childSchema, `${location}.${key}`);
  }
  if (node.additionalProperties && typeof node.additionalProperties === "object") {
    const known = new Set(Object.keys(node.properties ?? {}));
    for (const [key, child] of Object.entries(value)) {
      if (!known.has(key)) validate(child, node.additionalProperties, `${location}.${key}`);
    }
  }
}

validate(database, schema);

const requiredObject = (value, location) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${location}: expected object`);
  }
  return value;
};
const requiredArray = (value, location) => {
  if (!Array.isArray(value)) throw new Error(`${location}: expected array`);
  return value;
};

const meta = requiredObject(database.database_meta, "$.database_meta");
const dataModel = requiredObject(database.data_model, "$.data_model");
const catalogs = requiredObject(database.catalogs, "$.catalogs");
const nutrientCatalog = new Map(requiredArray(catalogs.nutrients, "$.catalogs.nutrients").map((item) => [item.code, item]));
const derivedExpressionCatalog = new Map(
  requiredArray(catalogs.derived_expressions, "$.catalogs.derived_expressions").map((item) => [item.code, item]),
);
const lifeStageCatalog = new Map(requiredArray(catalogs.life_stages, "$.catalogs.life_stages").map((item) => [item.code, item]));

for (const field of ["version", "clinical_warning_ru", "formula_expression_language"]) {
  if (typeof meta[field] !== "string" || meta[field].length === 0) {
    throw new Error(`$.database_meta.${field}: expected non-empty string`);
  }
}
requiredArray(dataModel.animal_profile_fields, "$.data_model.animal_profile_fields");

const stages = [];
const formulas = [];
const sizeClasses = [];
const lactationRules = {};

for (const species of ["dog", "cat"]) {
  const speciesData = requiredObject(database.species_data[species], `$.species_data.${species}`);
  for (const profile of requiredArray(speciesData.nutrient_profiles, `$.species_data.${species}.nutrient_profiles`)) {
    const catalogStage = lifeStageCatalog.get(profile.code);
    if (!catalogStage) throw new Error(`Missing life-stage catalog entry for ${profile.code}`);
    const source = {
      table: profile.source?.table ?? null,
      page: profile.source?.page ?? null,
      url: profile.source?.url ?? meta.source.url,
    };
    stages.push({
      code: profile.code,
      species: profile.species_code,
      nameRu: profile.name_ru ?? catalogStage.name_ru,
      physiologicalState: profile.physiological_state ?? catalogStage.physiological_state ?? null,
      merReference: profile.mer_reference ?? catalogStage.mer_reference ?? null,
      basis: profile.basis,
      source,
      nutrients: requiredArray(profile.nutrients, `$.species_data.${species}.nutrient_profiles.${profile.code}.nutrients`).map((value) => {
        const code = value.code;
        const catalogNutrient = nutrientCatalog.get(code) ?? derivedExpressionCatalog.get(code);
        if (!catalogNutrient) throw new Error(`Missing nutrient or derived-expression catalog entry for ${code}`);
        return {
          code,
          category: catalogNutrient.category_code,
          nameRu: catalogNutrient.name_ru,
          unit: value.unit,
          min: value.minimum,
          minUpper: value.minimum_upper ?? null,
          established: value.established,
          sourceValueText: value.source_value_text ?? null,
          footnote: value.footnote ?? null,
          noteRu: value.note_ru ?? null,
          applicabilityRuleCode: value.applicability_rule_code ?? null,
        };
      }),
    });
  }

  for (const formula of requiredArray(speciesData.energy_formulas, `$.species_data.${species}.energy_formulas`)) {
    formulas.push({
      species,
      code: formula.code,
      nameRu: formula.name_ru,
      displayFormulaRu: formula.display_formula_ru ?? null,
      displayRangeRu: formula.display_range_ru ?? null,
      parameterDescriptionRu: formula.parameter_description_ru ?? null,
      resultUnit: formula.result_unit,
      expression: formula.expression ?? null,
      expressionMin: formula.expression_min ?? null,
      expressionMax: formula.expression_max ?? null,
      rangeExpression: formula.range_expression ?? null,
      parameters: formula.parameters ?? [],
      constraints: formula.constraints ?? null,
      page: formula.page ?? null,
      noteRu: formula.note_ru ?? null,
      sourceUrl: formula.source_url ?? meta.source.url,
    });
  }

  const rawSizeClasses = Array.isArray(speciesData.size_classes)
    ? speciesData.size_classes
    : speciesData.size_classes?.items ?? [];
  for (const sizeClass of rawSizeClasses) {
    sizeClasses.push({
      species,
      code: sizeClass.code,
      nameRu: sizeClass.name_ru,
      expectedAdultWeightKg: sizeClass.expected_adult_weight_kg,
      growthCurvePercentExpression: sizeClass.growth_curve_percent_expression ?? null,
      growthCurveAgeWeeks: sizeClass.growth_curve_age_weeks ?? null,
    });
  }

  const lactation = requiredObject(speciesData.lactation, `$.species_data.${species}.lactation`);
  lactationRules[species] = {
    nutrientProfileStageCode: lactation.nutrient_profile_stage_code,
    weekFactors: lactation.week_factors,
    energyFormulaCodes: lactation.energy_formula_codes,
    sourcePage: lactation.source_page,
  };
}

const mappedCatalogs = {
  species: catalogs.species.map((item) => ({ code: item.code, nameRu: item.name_ru, nameEn: item.name_en })),
  nutrientCategories: catalogs.nutrient_categories.map((item) => ({ code: item.code, nameRu: item.name_ru })),
  nutrients: catalogs.nutrients.map((item) => ({
    code: item.code,
    nameRu: item.name_ru,
    nameEn: item.name_en,
    categoryCode: item.category_code,
    unitPer1000KcalMe: item.unit_per_1000_kcal_me,
  })),
  derivedExpressions: catalogs.derived_expressions.map((item) => ({
    code: item.code,
    nameRu: item.name_ru,
    nameEn: item.name_en,
    categoryCode: item.category_code,
    unitPer1000KcalMe: item.unit_per_1000_kcal_me,
  })),
  lifeStages: catalogs.life_stages.map((item) => ({
    code: item.code,
    species: item.species_code,
    nameRu: item.name_ru,
    physiologicalState: item.physiological_state ?? null,
    merReference: item.mer_reference ?? null,
  })),
};

const json = (value) => JSON.stringify(value, null, 2);
const banner = `// AUTO-GENERATED by scripts/generate-fediaf-data.mjs — DO NOT EDIT BY HAND.
// Source: docs/fediaf_2025_veterinary_nutrition_database_ru.json
// Schema: docs/fediaf_2025_veterinary_nutrition_schema.json
// Regenerate with: node scripts/generate-fediaf-data.mjs
`;

const body = `${banner}
export type FediafSpecies = "dog" | "cat";

export interface FediafDatabaseMeta {
  id: string;
  title_ru: string;
  version: string;
  generated_at: string;
  language: string;
  source: { title: string; publication_date: string; url: string };
  scope: {
    species: FediafSpecies[];
    healthy_animals_only: boolean;
    complete_and_complementary_pet_food: boolean;
    disease_specific_diets_included: boolean;
    reason_ru: string;
  };
  clinical_warning_ru: string;
  normal_digestibility_assumptions: Record<string, number | string>;
  formula_expression_language: "mathjs-compatible";
}

export interface FediafNutrientCatalogEntry {
  code: string;
  nameRu: string;
  nameEn: string;
  categoryCode: string;
  unitPer1000KcalMe: string;
}

export interface FediafLifeStageCatalogEntry {
  code: string;
  species: FediafSpecies;
  nameRu: string;
  physiologicalState: string | null;
  merReference: string | null;
}

export interface FediafCatalogs {
  species: Array<{ code: FediafSpecies; nameRu: string; nameEn: string }>;
  nutrientCategories: Array<{ code: string; nameRu: string }>;
  nutrients: FediafNutrientCatalogEntry[];
  derivedExpressions: FediafNutrientCatalogEntry[];
  lifeStages: FediafLifeStageCatalogEntry[];
}

/** One nutrient value per 1000 kcal ME. Null means "not established", never zero. */
export interface FediafNutrientMin {
  code: string;
  category: string;
  nameRu: string;
  unit: string;
  min: number | null;
  minUpper: number | null;
  established: boolean;
  sourceValueText: string | null;
  footnote: string | null;
  noteRu: string | null;
  applicabilityRuleCode: "feed_form_wet" | "feed_form_dry" | null;
}

export interface FediafStage {
  code: string;
  species: FediafSpecies;
  nameRu: string;
  physiologicalState: string | null;
  merReference: string | null;
  basis: { energy: number; energy_unit: string; energy_type: string };
  source: { table: string | null; page: number | null; url: string };
  nutrients: FediafNutrientMin[];
}

export interface FediafNumericConstraint {
  min?: number;
  max?: number;
  min_inclusive?: boolean;
  max_inclusive?: boolean;
  min_exclusive?: number | boolean;
  max_exclusive?: number | boolean;
}

/** Expressions are preserved verbatim in the database's mathjs-compatible language. */
export interface FediafEnergyFormula {
  species: FediafSpecies;
  code: string;
  nameRu: string;
  displayFormulaRu: string | null;
  displayRangeRu: string | null;
  parameterDescriptionRu: string | null;
  resultUnit: "kcal_ME_per_day";
  expression: string | null;
  expressionMin: string | null;
  expressionMax: string | null;
  rangeExpression: string | null;
  parameters: string[];
  constraints: Record<string, FediafNumericConstraint> | null;
  page: number | null;
  noteRu: string | null;
  sourceUrl: string;
}

export interface FediafSizeClass {
  species: FediafSpecies;
  code: string;
  nameRu: string;
  expectedAdultWeightKg: FediafNumericConstraint;
  growthCurvePercentExpression: string | null;
  growthCurveAgeWeeks: { min: number; max: number } | null;
}

export interface FediafLactationRules {
  nutrientProfileStageCode: string;
  weekFactors: Record<string, number>;
  energyFormulaCodes: string[];
  sourcePage: number;
}

export const FEDIAF_DATABASE_META: FediafDatabaseMeta = ${json(meta)};
export const FEDIAF_VERSION = FEDIAF_DATABASE_META.version;
export const FEDIAF_SOURCE_TITLE = FEDIAF_DATABASE_META.source.title;
export const FEDIAF_SOURCE_URL = FEDIAF_DATABASE_META.source.url;
export const FEDIAF_PUBLICATION_DATE = FEDIAF_DATABASE_META.source.publication_date;
export const FEDIAF_CLINICAL_WARNING_RU = FEDIAF_DATABASE_META.clinical_warning_ru;
export const FEDIAF_EDITION = \`\${FEDIAF_SOURCE_TITLE} — \${FEDIAF_VERSION}\`;

export const FEDIAF_ANIMAL_PROFILE_FIELDS: string[] = ${json(dataModel.animal_profile_fields)};
export const FEDIAF_CATALOGS: FediafCatalogs = ${json(mappedCatalogs)};
export const FEDIAF_SIZE_CLASSES: FediafSizeClass[] = ${json(sizeClasses)};
export const FEDIAF_LACTATION_RULES: Record<FediafSpecies, FediafLactationRules> = ${json(lactationRules)};
export const FEDIAF_NUTRIENT_STAGES: FediafStage[] = ${json(stages)};
export const FEDIAF_ENERGY_FORMULAS: FediafEnergyFormula[] = ${json(formulas)};
`;

if (!validateOnly) {
  fs.writeFileSync(OUT, body, "utf8");
  console.log(`Wrote ${path.relative(root, OUT)} from ${path.relative(root, DATABASE_PATH)}`);
}
console.log(`  schema: ${path.relative(root, SCHEMA_PATH)} (valid)`);
console.log(`  stages: ${stages.length}, energy formulas: ${formulas.length}, size classes: ${sizeClasses.length}`);
