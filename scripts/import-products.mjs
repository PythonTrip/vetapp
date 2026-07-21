import { readFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const catalogPath = path.join(process.cwd(), "scripts", "data", "catalog.json");
const categories = [
  "белки",
  "углеводы",
  "жиры",
  "клетчатка",
  "сухие корма",
  "влажные корма",
  "добавки",
  "лакомства",
];
const nutrientCodes = [
  "ME/DM", "CP/ME", "CP/DM", "CH/DM", "CFa/DM", "CFi/DM", "CAs/DM", "Ca/P", "Zn/Ca", "ω6/ω3",
  "ME", "CP", "CFa", "CFi", "CAs", "CH", "MO", "DM",
  "Ca", "P", "Mg", "Na", "K", "Cl", "Fe", "Cu", "Zn", "Mn", "Se", "J",
  "A", "D", "E", "B1", "B2", "B3", "B4", "B5", "B6", "B7", "B9", "B12", "C",
  "His", "Phe", "Tau", "Thr", "Trp", "Tyr", "Val", "Met", "Ile", "Lys", "Arg", "Leu", "Cys",
  "LA", "ALA", "AA", "EPA", "DHA",
];

async function importProducts() {
  const filePath = path.join(process.cwd(), "products_normalized.json");
  const [products, catalog] = await Promise.all([
    readFile(filePath, "utf8").then(JSON.parse),
    readFile(catalogPath, "utf8").then(JSON.parse),
  ]);
  const catalogCategories = catalog[0]?.data ?? [];
  const catalogSubcategories = new Map(
    catalogCategories.map((category) => [
      category.name.toLocaleLowerCase("ru-RU"),
      new Map((category.data ?? []).map((item) => [item.name.toLocaleLowerCase("ru-RU"), item.name])),
    ]),
  );
  const allowedCategories = new Set(categories);
  const invalid = products.filter((product) => !allowedCategories.has(product.type));

  if (invalid.length > 0) {
    throw new Error(`Неизвестные категории: ${[...new Set(invalid.map((item) => item.type))].join(", ")}`);
  }

  await db.$transaction(async (tx) => {
    await tx.nutritionProductNutrient.deleteMany();
    await tx.nutritionProduct.deleteMany();

    for (const raw of products) {
      const calculated = new Set(raw.calculated ?? []);
      const nutrients = nutrientCodes.flatMap((code) => {
        const value = raw[code];
        return typeof value === "number" && Number.isFinite(value)
          ? [{ code, value, calculated: calculated.has(code) }]
          : [];
      });

      await tx.nutritionProduct.create({
        data: {
          name: raw.name,
          searchName: raw.name.toLocaleLowerCase("ru-RU"),
          category: raw.type,
          subcategory: catalogSubcategories
            .get(raw.type.toLocaleLowerCase("ru-RU"))
            ?.get(String(raw.subcat ?? "").toLocaleLowerCase("ru-RU")) ?? null,
          nutrients: { create: nutrients },
        },
      });
    }
  });

  console.log(`Импортировано продуктов: ${products.length}`);
}

importProducts()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
