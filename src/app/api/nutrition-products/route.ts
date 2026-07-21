import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { NUTRIENT_CODES, NUTRITION_CATEGORIES } from "@/lib/nutrition-products";
import { getNutritionSubcategories } from "@/lib/nutrition-subcategories";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  // Mode: fetch full products by ids (used by Diet Builder nutrient analysis)
  const idsParam = params.get("ids");
  if (idsParam !== null) {
    const ids = idsParam
      .split(",")
      .map((value) => Number.parseInt(value, 10))
      .filter((value) => Number.isInteger(value) && value > 0)
      .slice(0, 100);
    const products = ids.length > 0
      ? await db.nutritionProduct.findMany({
          where: { id: { in: ids } },
          include: { nutrients: { orderBy: { id: "asc" } } },
        })
      : [];
    return NextResponse.json({
      products: products.map(({ searchName: _searchName, ...product }) => product),
    });
  }

  // Mode: global search across all categories (used by Diet Builder inline search).
  // Rank matches at the start of the name (and shorter names) first, so raw
  // ingredients («Морковь») outrank the many branded foods that merely mention them.
  const globalQuery = params.get("q");
  if (globalQuery !== null) {
    const q = globalQuery.trim().slice(0, 100).toLocaleLowerCase("ru-RU");
    let products: Array<{ id: number } & Record<string, unknown>> = [];
    if (q.length > 0) {
      const idRows = await db.$queryRaw<Array<{ id: number }>>(Prisma.sql`
        SELECT id FROM "NutritionProduct"
        WHERE strpos("searchName", ${q}) > 0
        ORDER BY strpos("searchName", ${q}) ASC, length(name) ASC, name ASC
        LIMIT 20
      `);
      const rows = idRows.length > 0
        ? await db.nutritionProduct.findMany({
            where: { id: { in: idRows.map((row) => row.id) } },
            include: { nutrients: { orderBy: { id: "asc" } } },
          })
        : [];
      const rowMap = new Map(rows.map((row) => [row.id, row]));
      products = idRows.flatMap((row) => {
        const product = rowMap.get(row.id);
        return product ? [product] : [];
      });
    }
    return NextResponse.json({
      products: products.map(({ searchName: _searchName, ...product }) => product),
    });
  }

  const requestedCategory = params.get("category") ?? NUTRITION_CATEGORIES[0];
  const category = NUTRITION_CATEGORIES.includes(requestedCategory as (typeof NUTRITION_CATEGORIES)[number])
    ? requestedCategory
    : NUTRITION_CATEGORIES[0];
  const search = (params.get("search") ?? "").trim().slice(0, 100).toLocaleLowerCase("ru-RU");
  const availableSubcategories = getNutritionSubcategories(category);
  const requestedSubcategory = (params.get("subcategory") ?? "").trim();
  const subcategory = availableSubcategories.includes(requestedSubcategory) ? requestedSubcategory : null;
  const requestedSortBy = params.get("sortBy") ?? "name";
  const sortBy = requestedSortBy === "name" || NUTRIENT_CODES.includes(requestedSortBy)
    ? requestedSortBy
    : "name";
  const sortDirection = params.get("sortDirection") === "desc" ? "desc" : "asc";
  const requestedPage = Number.parseInt(params.get("page") ?? "1", 10);
  const page = Number.isFinite(requestedPage) ? Math.max(1, requestedPage) : 1;
  const pageSize = 24;
  const where: Prisma.NutritionProductWhereInput = {
    category,
    ...(subcategory ? { subcategory } : {}),
    ...(search ? { searchName: { contains: search } } : {}),
  };
  const sqlFilters = [Prisma.sql`p.category = ${category}`];
  if (subcategory) sqlFilters.push(Prisma.sql`p.subcategory = ${subcategory}`);
  if (search) sqlFilters.push(Prisma.sql`strpos(p."searchName", ${search}) > 0`);

  const sqlDirection = sortDirection === "desc" ? Prisma.raw("DESC") : Prisma.raw("ASC");
  const sqlOrder = sortBy === "name"
    ? Prisma.sql`p.name ${sqlDirection}`
    : Prisma.sql`(n.value IS NULL) ASC, n.value ${sqlDirection}, p.name ASC`;
  const nutrientJoin = sortBy === "name"
    ? Prisma.empty
    : Prisma.sql`LEFT JOIN "NutritionProductNutrient" AS n ON n."productId" = p.id AND n.code = ${sortBy}`;
  const offset = (page - 1) * pageSize;

  const [productIds, total, groupedCounts, groupedSubcategoryCounts] = await Promise.all([
    db.$queryRaw<Array<{ id: number }>>(Prisma.sql`
      SELECT p.id
      FROM "NutritionProduct" AS p
      ${nutrientJoin}
      WHERE ${Prisma.join(sqlFilters, " AND ")}
      ORDER BY ${sqlOrder}
      LIMIT ${pageSize} OFFSET ${offset}
    `),
    db.nutritionProduct.count({ where }),
    db.nutritionProduct.groupBy({ by: ["category"], _count: { _all: true } }),
    db.nutritionProduct.groupBy({
      by: ["subcategory"],
      where: { category },
      _count: { _all: true },
    }),
  ]);

  const productRows = productIds.length > 0
    ? await db.nutritionProduct.findMany({
        where: { id: { in: productIds.map((row) => row.id) } },
        include: { nutrients: { orderBy: { id: "asc" } } },
      })
    : [];
  const productMap = new Map(productRows.map((product) => [product.id, product]));
  const products = productIds.flatMap((row) => {
    const product = productMap.get(row.id);
    return product ? [product] : [];
  });

  const categoryCounts = Object.fromEntries(
    NUTRITION_CATEGORIES.map((item) => [
      item,
      groupedCounts.find((row) => row.category === item)?._count._all ?? 0,
    ]),
  );
  const subcategoryCountMap = new Map(
    groupedSubcategoryCounts.map((row) => [row.subcategory, row._count._all]),
  );
  const subcategories = availableSubcategories.map((name) => ({
    name,
    count: subcategoryCountMap.get(name) ?? 0,
  }));

  return NextResponse.json({
    products: products.map(({ searchName: _searchName, ...product }) => product),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    categoryCounts,
    subcategories,
  });
}
