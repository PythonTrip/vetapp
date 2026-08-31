"use client";

import * as React from "react";
import { Check, ChevronRight, Loader2, Plus, Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useDebouncedValue,
  useFoodCategoriesQuery,
  useFoodQuery,
  useFoodsQuery,
  useNutrientsQuery,
} from "@/lib/hooks";
import type {
  FoodCategoryGroupRecord,
  FoodCategoryPair,
  FoodSummaryRecord,
  FoodType,
} from "@/lib/api-client";
import { apiErrorMessage } from "@/lib/patient-form";
import { cn } from "@/lib/utils";

type CatalogScope = "all" | "natural" | "feeds" | "supplements" | "treats";

const SCOPE_OPTIONS: { value: CatalogScope; label: string; type?: FoodType }[] = [
  { value: "all", label: "Все" },
  { value: "natural", label: "Натуральные продукты", type: "ingredient" },
  { value: "feeds", label: "Корма", type: "commercial" },
  { value: "supplements", label: "Добавки", type: "supplement" },
  { value: "treats", label: "Лакомства" },
];

function categoryKey(value: string | null): string {
  return value == null ? "__null__" : value;
}

function categoryLabel(value: string | null): string {
  return value ?? "Без категории";
}

function isTreatCategory(group: FoodCategoryGroupRecord): boolean {
  return /лаком|treat/i.test(group.category ?? "");
}

export function RationAddDialog({
  open,
  onOpenChange,
  existingFoodIds,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingFoodIds: string[];
  onAdd: (food: FoodSummaryRecord) => void;
}) {
  const [query, setQuery] = React.useState("");
  const [scope, setScope] = React.useState<CatalogScope>("all");
  const [category, setCategory] = React.useState<string | null | undefined>(undefined);
  const [subcategory, setSubcategory] = React.useState<string | null | undefined>(undefined);
  const debouncedQuery = useDebouncedValue(query, 220);
  const categories = useFoodCategoriesQuery();
  const nutrients = useNutrientsQuery();
  const selectedScope = SCOPE_OPTIONS.find((item) => item.value === scope);

  React.useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      document.getElementById("ration-food-search")?.focus();
    }, 80);
    return () => window.clearTimeout(timer);
  }, [open]);

  React.useEffect(() => {
    if (scope !== "treats" || !categories.data?.length) return;
    const treatGroup = categories.data.find(isTreatCategory);
    setCategory(treatGroup?.category);
    setSubcategory(undefined);
  }, [categories.data, scope]);

  const categoryPairs = React.useMemo<FoodCategoryPair[]>(() => {
    if (category === undefined) return [];
    if (subcategory !== undefined) return [{ category, subcategory }];
    return [{ category, subcategory: null, allSubcategories: true }];
  }, [category, subcategory]);
  const enabled = open && (
    debouncedQuery.trim().length > 0
    || selectedScope?.type !== undefined
    || category !== undefined
  );
  const foods = useFoodsQuery(
    debouncedQuery.trim(),
    selectedScope?.type,
    categoryPairs,
    enabled,
  );
  const existing = React.useMemo(() => new Set(existingFoodIds), [existingFoodIds]);
  const activeGroup = categories.data?.find((group) => group.category === category);

  function changeScope(next: CatalogScope) {
    setScope(next);
    setCategory(undefined);
    setSubcategory(undefined);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="bg-black/15"
        className="inset-y-0 left-auto right-0 top-0 flex h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-y-0 border-r-0 p-0 shadow-[-20px_0_48px_-36px_oklch(0.2_0.04_175_/_0.55)] data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right data-[state=closed]:zoom-out-100 data-[state=open]:zoom-in-100 sm:max-w-[680px]"
      >
        <DialogHeader className="border-b px-5 py-4 pr-14 sm:px-6">
          <DialogTitle className="text-base">Добавить продукт</DialogTitle>
          <DialogDescription className="sr-only">
            Поиск и последовательное добавление продуктов в рацион.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="space-y-3 border-b px-5 py-4 sm:px-6">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="ration-food-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Поиск по названию…"
                className="h-10 pl-9"
                aria-label="Поиск продукта по названию"
                autoFocus
              />
            </div>

            <div className="flex flex-wrap gap-1.5" aria-label="Тип продукта">
              {SCOPE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => changeScope(option.value)}
                  className={cn(
                    "h-8 shrink-0 rounded-md border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    scope === option.value
                      ? "border-primary bg-primary text-primary-foreground"
                      : "bg-card text-muted-foreground hover:border-primary/45 hover:text-foreground",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {scope !== "treats" ? (
              <div className="flex flex-wrap items-center gap-2">
                <SlidersHorizontal className="size-3.5 text-muted-foreground" />
                <select
                  value={category === undefined ? "" : categoryKey(category)}
                  onChange={(event) => {
                    const value = event.target.value;
                    setCategory(value ? (value === "__null__" ? null : value) : undefined);
                    setSubcategory(undefined);
                  }}
                  className="h-8 min-w-48 rounded-md border bg-background px-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Категория продукта"
                >
                  <option value="">Все категории</option>
                  {(categories.data ?? []).map((group) => (
                    <option key={categoryKey(group.category)} value={categoryKey(group.category)}>
                      {categoryLabel(group.category)}
                    </option>
                  ))}
                </select>
                {activeGroup?.subcategories.length ? (
                  <select
                    value={subcategory === undefined ? "" : categoryKey(subcategory)}
                    onChange={(event) => {
                      const value = event.target.value;
                      setSubcategory(value ? (value === "__null__" ? null : value) : undefined);
                    }}
                    className="h-8 min-w-44 rounded-md border bg-background px-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="Подкатегория продукта"
                  >
                    <option value="">Все подкатегории</option>
                    {activeGroup.subcategories.map((item) => (
                      <option key={categoryKey(item)} value={categoryKey(item)}>
                        {categoryLabel(item)}
                      </option>
                    ))}
                  </select>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3 sm:px-6" aria-live="polite">
            {!enabled ? (
              <div className="flex min-h-52 flex-col items-center justify-center text-center">
                <Search className="size-5 text-muted-foreground" />
                <p className="mt-3 text-sm font-medium">Начните с названия продукта</p>
                <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                  Поиск — основной сценарий. Категории помогут сузить каталог при необходимости.
                </p>
              </div>
            ) : foods.isPending ? (
              <div className="space-y-2" aria-busy="true">
                {[0, 1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-[74px] w-full rounded-lg" />)}
              </div>
            ) : foods.isError ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5" role="alert">
                <p className="text-sm text-destructive">{apiErrorMessage(foods.error)}</p>
                <Button type="button" variant="outline" size="sm" onClick={() => void foods.refetch()}>
                  Повторить
                </Button>
              </div>
            ) : (foods.data ?? []).length ? (
              <div className="divide-y rounded-lg border bg-card">
                {(foods.data ?? []).map((food) => (
                  <FoodResult
                    key={food.uuid}
                    food={food}
                    added={existing.has(food.uuid)}
                    nutrientTotal={(nutrients.data ?? []).filter((item) => item.is_active).length}
                    onAdd={onAdd}
                  />
                ))}
              </div>
            ) : (
              <div className="flex min-h-52 items-center justify-center text-center text-sm text-muted-foreground">
                По выбранным фильтрам продукты не найдены.
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-t px-5 py-3 text-xs text-muted-foreground sm:px-6">
            <span>{(foods.data ?? []).length ? `Найдено: ${(foods.data ?? []).length}` : "Каталог продуктов"}</span>
            {foods.isFetching && !foods.isPending ? <span className="flex items-center gap-1.5"><Loader2 className="size-3.5 animate-spin" />Обновление</span> : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FoodResult({ food, added, nutrientTotal, onAdd }: {
  food: FoodSummaryRecord;
  added: boolean;
  nutrientTotal: number;
  onAdd: (food: FoodSummaryRecord) => void;
}) {
  const details = useFoodQuery(food.uuid);
  const knownValues = details.data?.nutrient_values.filter(
    (item) => item.value_status !== "unknown" && item.value != null,
  ).length;
  const energy = details.data?.nutrient_values.find(
    (item) => item.code === "ME" && item.basis === "per_100g_as_fed" && item.value_status !== "unknown",
  )?.value;

  return (
    <div className="group flex min-w-0 items-center gap-3 px-3 py-2.5 hover:bg-muted/35">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{food.name}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {[food.category, food.subcategory].filter(Boolean).join(" › ") || "Без категории"}
          {food.type === "commercial" ? " · commercial" : ""}
        </p>
        <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
          {details.isPending
            ? "Загрузка состава…"
            : `${energy == null ? "Энергия —" : `${energy.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} ккал / 100 г`} · данные ${knownValues ?? 0}/${nutrientTotal || "—"}`}
        </p>
      </div>
      <Button
        type="button"
        size="icon"
        variant={added ? "secondary" : "outline"}
        className="size-8 shrink-0 rounded-md"
        disabled={added}
        onClick={() => onAdd(food)}
        aria-label={added ? `${food.name} уже добавлен` : `Добавить ${food.name}`}
      >
        {added ? <Check className="size-4" /> : <Plus className="size-4" />}
      </Button>
      <ChevronRight className="hidden size-3.5 text-muted-foreground/50 sm:block" aria-hidden="true" />
    </div>
  );
}
