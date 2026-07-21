/**
 * One-shot: copy all rows from db/custom.db (SQLite) into the Postgres DB
 * pointed at by DATABASE_URL / DIRECT_URL (Neon).
 *
 * Usage: node --env-file=.env scripts/sqlite-to-neon.mjs
 */
import { DatabaseSync } from "node:sqlite";
import { PrismaClient } from "@prisma/client";

const sqlitePath = process.argv[2] ?? "db/custom.db";
const sqlite = new DatabaseSync(sqlitePath, { readOnly: true });
const dbUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;

function createDb() {
  return new PrismaClient({
    datasources: { db: { url: dbUrl } },
  });
}

let db = createDb();

async function reconnect() {
  try {
    await db.$disconnect();
  } catch {
    // ignore
  }
  db = createDb();
  await db.$queryRaw`SELECT 1`;
}

async function withRetry(label, fn, attempts = 8) {
  let last;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      last = error;
      const msg = error?.message ?? String(error);
      const code = error?.code;
      console.warn(`\n  retry ${i}/${attempts} ${label}: [${code ?? "?"}] ${msg.slice(0, 140)}`);
      if (code === "P1017" || /closed the connection|timed out|Can't reach/i.test(msg)) {
        await reconnect();
      }
      await new Promise((r) => setTimeout(r, 1000 * i));
    }
  }
  throw last;
}

const DATE_FIELDS = new Set([
  "birthDate",
  "createdAt",
  "updatedAt",
  "date",
  "followUpDate",
  "completedAt",
  "expiresAt",
  "viewedAt",
]);

const BOOL_FIELDS = new Set([
  "neutered",
  "isLatest",
  "followUp",
  "revoked",
  "calculated",
]);

function toDate(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date) return value;
  if (typeof value === "number") {
    // Prisma/SQLite often stores ms epoch; also handle seconds.
    const ms = value < 1e12 ? value * 1000 : value;
    return new Date(ms);
  }
  if (typeof value === "string") {
    if (/^\d+$/.test(value)) {
      const n = Number(value);
      const ms = n < 1e12 ? n * 1000 : n;
      return new Date(ms);
    }
    return new Date(value);
  }
  return new Date(value);
}

function toBool(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const v = value.toLowerCase();
    if (v === "true" || v === "1") return true;
    if (v === "false" || v === "0") return false;
  }
  return Boolean(value);
}

function normalizeRow(row) {
  const out = { ...row };
  for (const key of Object.keys(out)) {
    if (DATE_FIELDS.has(key)) out[key] = toDate(out[key]);
    if (BOOL_FIELDS.has(key)) out[key] = toBool(out[key]);
  }
  return out;
}

function selectAll(table) {
  return sqlite.prepare(`SELECT * FROM "${table}"`).all().map(normalizeRow);
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function createManyBatched(label, getModel, rows, batchSize = 500) {
  if (rows.length === 0) {
    console.log(`${label}: 0 rows`);
    return;
  }
  let done = 0;
  for (const part of chunk(rows, batchSize)) {
    await withRetry(`${label} @${done}`, () =>
      getModel().createMany({ data: part, skipDuplicates: true }),
    );
    done += part.length;
    if (rows.length > batchSize) {
      process.stdout.write(`\r${label}: ${done}/${rows.length}`);
    }
  }
  if (rows.length > batchSize) process.stdout.write("\n");
  console.log(`${label}: ${rows.length} rows`);
}

async function main() {
  console.log(`Source: ${sqlitePath}`);
  console.log("Target: Neon/Postgres via Prisma");
  await withRetry("warmup", () => db.$queryRaw`SELECT 1`);

  // Clear destination in FK-safe order (children first), one table at a time.
  console.log("Clearing destination tables...");
  const clearOrder = [
    ["NutritionProductNutrient", () => db.nutritionProductNutrient.deleteMany()],
    ["NutritionProduct", () => db.nutritionProduct.deleteMany()],
    ["ShareToken", () => db.shareToken.deleteMany()],
    ["CommunicationLog", () => db.communicationLog.deleteMany()],
    ["LesionPhoto", () => db.lesionPhoto.deleteMany()],
    ["Consultation", () => db.consultation.deleteMany()],
    ["Appointment", () => db.appointment.deleteMany()],
    ["DietPlan", () => db.dietPlan.deleteMany()],
    ["CustomTemplate", () => db.customTemplate.deleteMany()],
    ["CustomHandout", () => db.customHandout.deleteMany()],
    ["Pet", () => db.pet.deleteMany()],
  ];
  for (const [label, fn] of clearOrder) {
    await withRetry(`clear ${label}`, fn);
    console.log(`  cleared ${label}`);
  }

  const pets = selectAll("Pet");
  const dietPlans = selectAll("DietPlan");
  const consultations = selectAll("Consultation");
  const photos = selectAll("LesionPhoto");
  const appointments = selectAll("Appointment");
  const templates = selectAll("CustomTemplate");
  const communications = selectAll("CommunicationLog");
  const handouts = selectAll("CustomHandout");
  const tokens = selectAll("ShareToken");
  const products = selectAll("NutritionProduct");
  const nutrients = selectAll("NutritionProductNutrient");

  await createManyBatched("Pet", () => db.pet, pets);
  await createManyBatched("DietPlan", () => db.dietPlan, dietPlans);
  await createManyBatched("Consultation", () => db.consultation, consultations);
  await createManyBatched("LesionPhoto", () => db.lesionPhoto, photos);
  await createManyBatched("Appointment", () => db.appointment, appointments);
  await createManyBatched("CustomTemplate", () => db.customTemplate, templates);
  await createManyBatched("CommunicationLog", () => db.communicationLog, communications);
  await createManyBatched("CustomHandout", () => db.customHandout, handouts);
  await createManyBatched("ShareToken", () => db.shareToken, tokens);
  await createManyBatched("NutritionProduct", () => db.nutritionProduct, products, 100);
  await createManyBatched(
    "NutritionProductNutrient",
    () => db.nutritionProductNutrient,
    nutrients,
    400,
  );

  // Keep serial sequences in sync after explicit id inserts.
  await withRetry("setval NutritionProduct", () =>
    db.$executeRawUnsafe(`
      SELECT setval(
        pg_get_serial_sequence('"NutritionProduct"', 'id'),
        COALESCE((SELECT MAX(id) FROM "NutritionProduct"), 1),
        true
      );
    `),
  );
  await withRetry("setval NutritionProductNutrient", () =>
    db.$executeRawUnsafe(`
      SELECT setval(
        pg_get_serial_sequence('"NutritionProductNutrient"', 'id'),
        COALESCE((SELECT MAX(id) FROM "NutritionProductNutrient"), 1),
        true
      );
    `),
  );

  const counts = {
    Pet: await withRetry("count Pet", () => db.pet.count()),
    Consultation: await withRetry("count Consultation", () => db.consultation.count()),
    DietPlan: await withRetry("count DietPlan", () => db.dietPlan.count()),
    Appointment: await withRetry("count Appointment", () => db.appointment.count()),
    CustomTemplate: await withRetry("count CustomTemplate", () => db.customTemplate.count()),
    CustomHandout: await withRetry("count CustomHandout", () => db.customHandout.count()),
    NutritionProduct: await withRetry("count NutritionProduct", () => db.nutritionProduct.count()),
    NutritionProductNutrient: await withRetry("count NutritionProductNutrient", () =>
      db.nutritionProductNutrient.count(),
    ),
  };
  console.log("Neon counts:", counts);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    sqlite.close();
    await db.$disconnect();
  });
