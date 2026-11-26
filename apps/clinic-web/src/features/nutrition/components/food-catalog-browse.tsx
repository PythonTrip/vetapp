"use client";

import * as React from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Loader2,
  PackageSearch,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  categoryCheckState,
  categoryLabel,
  categorySelectionPairs,
  subcategoryLabel,
  type CategorySelection,
} from "@/features/nutrition/components/category-selection";
import { CategoryTree } from "@/features/nutrition/components/category-tree";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Skeleton } from "@/shared/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { useFoodCategoriesQuery, useFoodMatrixQuery, useNutrientsQuery } from "@/features/nutrition/hooks";
import { useDebouncedValue } from "@/shared/hooks/use-debounced-value";
import type { FoodCategoryGroupRecord, FoodMatrixRowRecord, FoodMatrixSortDirection, NutrientCategory } from "@/features/nutrition/api";
import {
  canonicalGroupForCategory,
  orderedNutrients,
} from "@/features/nutrition/nutrient-columns";
import { apiErrorMessage } from "@/shared/api/error-message";
import { cn } from "@/shared/lib/utils";

const MATRIX_TABS: { value: NutrientCategory; label: string }[] = [
  { value: "main", label: "Основные" },
  { value: "mineral", label: "Минералы" },
  { value: "vitamin", label: "Витамины" },
  { value: "amino_acid", label: "Аминокислоты" },
  { value: "fatty_acid", label: "Жирные кислоты" },
];

const NUTRIENT_TOOLTIP_CODES = new Set(["ME", "CP", "CFa", "CFi", "CAs", "CH", "MO", "DM"]);

function formatMatrixValue(value: number): string {
  return value.toLocaleString("ru-RU", { maximumFractionDigits: 6 });
}

function SortIcon({ active, direction }: { active: boolean; direction: FoodMatrixSortDirection }) {
  if (!active) {
    return (
      <ArrowUpDown className="size-3.5 opacity-0 transition-opacity group-hover/sort:opacity-45 group-focus-visible/sort:opacity-45" />
    );
  }
  return direction === "asc"
    ? <ArrowUp className="size-3.5 text-primary" />
    : <ArrowDown className="size-3.5 text-primary" />;
}

export type FoodCatalogFilters = {
  query: string;
  setQuery: (value: string) => void;
  selection: CategorySelection;
  setSelection: React.Dispatch<React.SetStateAction<CategorySelection>>;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
};

export function FoodCatalogBrowse({
  query,
  setQuery,
  selection,
  setSelection,
  sidebarOpen,
  setSidebarOpen,
  inDialog = false,
  onEditFood,
  selectedFoodId,
  renderRowAction,
}: FoodCatalogFilters & {
  inDialog?: boolean;
  onEditFood?: (id: string) => void;
  selectedFoodId?: string | null;
  renderRowAction?: (food: FoodMatrixRowRecord) => React.ReactNode;
}) {
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const [overlayOpen, setOverlayOpen] = React.useState(false);
  const [expanded, setExpanded] = React.useState<Set<string | null>>(() => new Set());
  const [nutrientCategory, setNutrientCategory] = React.useState<NutrientCategory>("main");
  const [sort, setSort] = React.useState<{ field: string; direction: FoodMatrixSortDirection }>({
    field: "name",
    direction: "asc",
  });
  const nameColumnWidth = inDialog
    ? "w-36 min-w-36 sm:w-64 sm:min-w-64"
    : "w-64 min-w-52 sm:min-w-64 lg:w-96 lg:min-w-96 xl:w-[25rem] xl:min-w-[25rem]";
  const debouncedQuery = useDebouncedValue(query, 300);
  const search = query.trim() ? debouncedQuery.trim() : "";
  const categories = useFoodCategoriesQuery();
  const nutrients = useNutrientsQuery();
  const categoryPairs = React.useMemo(
    () => categorySelectionPairs(selection, categories.data ?? []),
    [categories.data, selection],
  );
  const visibleNutrients = React.useMemo(
    () => {
      const categoryNutrients = (nutrients.data ?? []).filter(
        (nutrient) => nutrient.category === nutrientCategory && nutrient.is_active,
      );
      const canonicalGroup = canonicalGroupForCategory(nutrientCategory);
      return canonicalGroup
        ? orderedNutrients(categoryNutrients, canonicalGroup)
        : categoryNutrients;
    },
    [nutrientCategory, nutrients.data],
  );
  const hasActiveFilters = query.trim().length > 0 || categoryPairs.length > 0;
  const listEnabled = search.length > 0 || categoryPairs.length > 0;
  const matrix = useFoodMatrixQuery({
    q: search,
    categoryPairs,
    nutrientCategory,
    sort: sort.field,
    sortDir: sort.direction,
  }, listEnabled);
  const resultsAreCurrent = query.trim() === search && !matrix.isPlaceholderData;
  const rows = matrix.data?.pages.flatMap((page) => page.items) ?? [];
  const total = matrix.data?.pages[0]?.total ?? 0;
  const activeCategoryFilters = categoryPairs.map(({ category, subcategory, allSubcategories }) => ({
    key: JSON.stringify([category, subcategory, allSubcategories]),
    label: allSubcategories
      ? categoryLabel(category)
      : `${categoryLabel(category)} · ${subcategoryLabel(subcategory)}`,
    category,
    subcategory,
    wholeCategory: allSubcategories,
  }));

  React.useEffect(() => {
    if (!inDialog) return;
    const frame = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [inDialog]);

  React.useEffect(() => {
    if (!overlayOpen) return;
    const wideLayout = window.matchMedia("(min-width: 1280px)");
    function closeOnWideLayout(event: MediaQueryListEvent) {
      if (event.matches) setOverlayOpen(false);
    }
    wideLayout.addEventListener("change", closeOnWideLayout);
    return () => wideLayout.removeEventListener("change", closeOnWideLayout);
  }, [overlayOpen]);

  function changeNutrientCategory(value: string) {
    const nextCategory = value as NutrientCategory;
    setNutrientCategory(nextCategory);
    if (
      sort.field !== "name"
      && !(nutrients.data ?? []).some(
        (nutrient) => nutrient.category === nextCategory && nutrient.code === sort.field,
      )
    ) {
      setSort({ field: "name", direction: "asc" });
    }
  }

  function toggleNutrientSort(code: string) {
    setSort((current) => current.field === code
      ? { field: code, direction: current.direction === "asc" ? "desc" : "asc" }
      : { field: code, direction: "asc" });
  }

  function toggleNameSort() {
    setSort((current) => current.field === "name"
      ? { field: "name", direction: current.direction === "asc" ? "desc" : "asc" }
      : { field: "name", direction: "asc" });
  }

  function toggleAll(group: FoodCategoryGroupRecord) {
    setSelection((current) => {
      const next = new Map(current);
      if (categoryCheckState(group, current.get(group.category)) === true) {
        next.delete(group.category);
      } else {
        next.set(group.category, new Set(group.subcategories.map(({ subcategory }) => subcategory)));
      }
      return next;
    });
  }

  function toggleSubcategory(category: string | null, subcategory: string | null, checked: boolean) {
    setSelection((current) => {
      const next = new Map(current);
      const subcategories = new Set(current.get(category));
      if (checked) subcategories.add(subcategory);
      else subcategories.delete(subcategory);
      if (subcategories.size) next.set(category, subcategories);
      else next.delete(category);
      return next;
    });
  }

  function clearCategory(category: string | null) {
    setSelection((current) => {
      const next = new Map(current);
      next.delete(category);
      return next;
    });
  }

  function toggleExpanded(category: string | null) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  const categoryTree = categories.isPending ? (
    <div className="space-y-2 p-3" aria-busy="true">
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-8 w-full" />
    </div>
  ) : categories.isError ? (
    <div className="space-y-2 p-3 text-xs text-destructive" role="alert">
      <p>{apiErrorMessage(categories.error)}</p>
      <Button type="button" variant="outline" size="sm" onClick={() => void categories.refetch()}>
        Повторить
      </Button>
    </div>
  ) : (
    <CategoryTree
      groups={categories.data}
      selection={selection}
      expanded={expanded}
      onToggleExpanded={toggleExpanded}
      onToggleCategory={toggleAll}
      onToggleSubcategory={toggleSubcategory}
    />
  );

  const emptyResults = (
    <div>
      <PackageSearch className="mx-auto size-5 text-muted-foreground" />
      <p className="mt-2 text-sm font-medium">Продукты не найдены</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {search ? `Измените запрос «${search}» или категории.` : "Измените выбранные категории."}
      </p>
    </div>
  );

  return (
    <div className={cn("min-w-0 lg:flex lg:min-h-0 lg:flex-1 xl:gap-3", inDialog && "flex min-h-0 flex-1")}>
      {sidebarOpen && (
        <aside aria-label="Категории" className="hidden w-64 shrink-0 flex-col overflow-hidden rounded-xl border bg-card xl:flex">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <h3 className="text-sm font-semibold">Категории</h3>
            <Button type="button" variant="ghost" size="icon" className="size-7" aria-label="Скрыть категории" onClick={() => setSidebarOpen(false)}>
              <PanelLeftClose className="size-4" />
            </Button>
          </div>
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">{categoryTree}</div>
        </aside>
      )}

      <div className={cn(
          "min-w-0 space-y-2.5 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:gap-2.5 lg:space-y-0",
          inDialog && "flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto space-y-0",
        )}>
        <section className="flex flex-wrap items-center gap-2 border-y bg-card/65 px-2 py-2.5 sm:px-3" aria-label="Фильтры каталога">
          <Dialog open={overlayOpen} onOpenChange={setOverlayOpen}>
            <DialogTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="h-8 xl:hidden">
                <PanelLeftOpen className="size-4" />
                Категории
              </Button>
            </DialogTrigger>
            <DialogContent
              showCloseButton={false}
              overlayClassName="z-[55] bg-black/30"
              className="left-0 top-0 z-[60] flex h-dvh w-64 max-w-full translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-y-0 border-l-0 p-0 sm:max-w-full"
            >
              <div className="flex items-center justify-between border-b px-3 py-2">
                <DialogTitle className="text-sm font-semibold">Категории</DialogTitle>
                <DialogDescription className="sr-only">Фильтры каталога по категориям и подкатегориям продуктов.</DialogDescription>
                <DialogClose asChild>
                  <Button type="button" variant="ghost" size="icon" className="size-7" aria-label="Закрыть категории">
                    <X className="size-4" />
                  </Button>
                </DialogClose>
              </div>
              <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">{categoryTree}</div>
            </DialogContent>
          </Dialog>
          {!sidebarOpen && (
            <Button type="button" variant="outline" size="sm" className="hidden h-8 xl:inline-flex" onClick={() => setSidebarOpen(true)}>
              <PanelLeftOpen className="size-4" />
              Категории
            </Button>
          )}
          <div className="relative min-w-0 flex-1 sm:max-w-72">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Название продукта или бренд"
              className="h-8 bg-background pl-8 pr-8 text-xs"
              aria-label={inDialog ? "Поиск продукта по названию" : "Поиск продуктов"}
              autoFocus={inDialog}
            />
            {query ? (
              <button
                type="button"
                className="absolute right-1.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setQuery("")}
                aria-label="Очистить поиск"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>
        </section>

        <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
          <Tabs value={nutrientCategory} onValueChange={changeNutrientCategory} className="min-w-0 gap-0">
            <TabsList className="scrollbar-none h-8 max-w-full justify-start overflow-x-auto rounded-lg bg-muted/70 p-0.5">
              {MATRIX_TABS.map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="h-7 shrink-0 flex-none rounded-md px-3 text-xs data-[state=active]:text-primary"
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          {hasActiveFilters && resultsAreCurrent && matrix.data ? (
            <p className="shrink-0 text-[11px] tabular-nums text-muted-foreground">Найдено: {total}</p>
          ) : null}
        </div>

        {hasActiveFilters ? (
          <div className="flex min-h-7 flex-wrap items-center gap-1.5" aria-label="Активные фильтры">
            <span className="mr-0.5 text-[11px] font-medium text-muted-foreground">Активные:</span>
            {query.trim() ? (
              <button
                type="button"
                className="inline-flex h-7 max-w-72 items-center gap-1.5 rounded-full bg-muted px-2.5 text-[11px] font-medium hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setQuery("")}
                title={query.trim()}
              >
                <span className="truncate">Поиск: {query.trim()}</span>
                <X className="size-3 shrink-0 text-muted-foreground" />
              </button>
            ) : null}
            {activeCategoryFilters.map((filter) => (
              <button
                type="button"
                key={filter.key}
                className="inline-flex h-7 max-w-72 items-center gap-1.5 rounded-full bg-accent px-2.5 text-[11px] font-medium text-accent-foreground hover:bg-accent/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => {
                  if (filter.wholeCategory) clearCategory(filter.category);
                  else toggleSubcategory(filter.category, filter.subcategory, false);
                }}
                title={`Убрать фильтр: ${filter.label}`}
              >
                <span className="truncate">{filter.label}</span>
                <X className="size-3 shrink-0 text-primary" />
              </button>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[11px] text-muted-foreground"
              onClick={() => {
                setQuery("");
                setSelection(new Map());
              }}
            >
              Сбросить
            </Button>
          </div>
        ) : null}

        {!hasActiveFilters ? (
          <div className="grid min-h-[24rem] place-items-center rounded-xl border border-dashed bg-card/75 px-4 py-10 text-center lg:min-h-0 lg:flex-1">
            <div className="max-w-lg">
              <div className="mx-auto grid size-10 place-items-center rounded-xl bg-muted text-primary">
                <PackageSearch className="size-5" />
              </div>
              <h3 className="mt-3 text-sm font-semibold">{inDialog ? "Выберите продукт для рациона" : "Выберите продукты для сравнения"}</h3>
              <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">
                Начните с категории или найдите продукт по названию и бренду{inDialog ? "." : " — таблица покажет сопоставимые нутриенты."}
              </p>
            </div>
          </div>
        ) : !listEnabled || matrix.isPending || nutrients.isPending ? (
          <div className="min-h-[24rem] overflow-hidden rounded-xl border bg-card lg:min-h-0 lg:flex-1" aria-busy="true">
            <Skeleton className="h-10 w-full rounded-none" />
            <div className="space-y-px p-px">
              <Skeleton className="h-11 w-full rounded-none" />
              <Skeleton className="h-11 w-full rounded-none" />
              <Skeleton className="h-11 w-full rounded-none" />
              <Skeleton className="h-11 w-full rounded-none" />
              <Skeleton className="h-11 w-full rounded-none" />
            </div>
          </div>
        ) : (matrix.isError && !matrix.isFetchNextPageError) || nutrients.isError ? (
          <div className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-6 text-center lg:min-h-0 lg:flex-1" role="alert">
            <p className="text-sm text-destructive">{apiErrorMessage(matrix.error ?? nutrients.error)}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (matrix.isError) void matrix.refetch();
                if (nutrients.isError) void nutrients.refetch();
              }}
            >
              Повторить
            </Button>
          </div>
        ) : !inDialog && !rows.length ? (
          <div className="grid min-h-[24rem] place-items-center rounded-xl border border-dashed bg-card px-4 py-10 text-center lg:min-h-0 lg:flex-1">
            {emptyResults}
          </div>
        ) : (
          <div
            className={cn(
              "relative overflow-hidden rounded-xl border bg-card lg:flex lg:min-h-0 lg:flex-1 lg:flex-col",
              inDialog && "flex min-h-32 flex-1 flex-col",
            )}
            aria-busy={matrix.isPlaceholderData}
          >
            {matrix.isPlaceholderData ? (
              <div
                className="absolute right-2.5 top-1.5 z-50 flex items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-[11px] text-muted-foreground shadow-sm"
                role="status"
              >
                <Loader2 className="size-3 animate-spin" />
                Обновляем
              </div>
            ) : null}

            <div className={cn(
              "scrollbar-thin min-h-[24rem] max-h-[calc(100dvh-14.5rem)] overflow-auto lg:min-h-0 lg:max-h-none lg:flex-1",
              inDialog && "min-h-0 max-h-none flex-1",
            )}>
              {rows.length ? (
                <table className="w-max min-w-full table-fixed border-collapse text-left text-xs tabular-nums">
                  <colgroup>
                    <col className={nameColumnWidth} />
                    {visibleNutrients.map((nutrient) => <col key={nutrient.code} className="w-24" />)}
                  </colgroup>
                  <thead className="text-[11px] text-muted-foreground">
                    <tr>
                      <th
                        scope="col"
                        className={cn("sticky left-0 top-0 z-40 border-b border-r bg-muted px-3 py-2", nameColumnWidth)}
                        aria-sort={sort.field === "name"
                          ? sort.direction === "asc" ? "ascending" : "descending"
                          : "none"}
                      >
                        <button
                          type="button"
                          className={cn(
                            "group/sort flex h-6 items-center gap-1.5 rounded-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            sort.field === "name" ? "text-primary" : "text-foreground",
                          )}
                          onClick={toggleNameSort}
                          title="Сортировать по названию"
                        >
                          Название
                          <SortIcon active={sort.field === "name"} direction={sort.direction} />
                        </button>
                      </th>
                      {visibleNutrients.map((nutrient) => {
                        const unit = nutrient.base_unit;
                        const tooltip = NUTRIENT_TOOLTIP_CODES.has(nutrient.code)
                          || nutrient.category === "vitamin";
                        return (
                          <th
                            key={nutrient.code}
                            className="sticky top-0 z-30 w-24 min-w-24 border-b bg-muted py-2 pl-2 pr-4 text-right"
                            aria-sort={sort.field === nutrient.code
                              ? sort.direction === "asc" ? "ascending" : "descending"
                              : "none"}
                          >
                            <button
                              type="button"
                              className={cn(
                                "group/sort relative ml-auto flex h-7 w-full flex-col items-end justify-center rounded-sm text-right font-mono font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                sort.field === nutrient.code ? "text-primary" : "text-foreground",
                              )}
                              onClick={() => toggleNutrientSort(nutrient.code)}
                              aria-label={`Сортировать по ${nutrient.name}, ${unit}`}
                              title={`${nutrient.code} — ${nutrient.name}, ${unit}`}
                            >
                              <span className="flex items-center gap-1">
                                {nutrient.code}
                                <SortIcon active={sort.field === nutrient.code} direction={sort.direction} />
                              </span>
                              <span className="font-sans text-[9px] font-normal leading-none text-muted-foreground">{unit}</span>
                              {tooltip ? (
                                <span
                                  role="tooltip"
                                  className="pointer-events-none absolute right-0 top-[calc(100%+0.4rem)] z-50 hidden w-48 rounded-lg bg-foreground px-2.5 py-2 text-left font-sans text-[11px] font-normal leading-4 text-background shadow-[0_10px_26px_-16px_oklch(0.2_0.03_175_/_0.75)] group-hover/sort:block group-focus-visible/sort:block"
                                >
                                  <strong className="block font-semibold">{nutrient.code} — {nutrient.name}</strong>
                                  <span className="opacity-75">{unit}</span>
                                </span>
                              ) : null}
                            </button>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((food) => {
                      const values = new Map(food.nutrient_values.map((item) => [item.code, item.value]));
                      const selectedRow = selectedFoodId === food.uuid;
                      return (
                        <tr
                          key={food.uuid}
                          className={cn(
                            "group border-b transition-colors last:border-b-0 hover:bg-muted/50",
                            onEditFood && "cursor-pointer",
                            selectedRow && "bg-accent/45",
                          )}
                          onClick={onEditFood ? () => onEditFood(food.uuid) : undefined}
                        >
                          <th
                            scope="row"
                            className={cn(
                              "sticky left-0 z-20 border-r bg-card px-3 py-2 text-left group-hover:bg-muted",
                              nameColumnWidth,
                              selectedRow && "bg-accent",
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <div className="min-w-0 flex-1">
                                {onEditFood ? (
                                  <button
                                    type="button"
                                    className="block max-w-full truncate rounded-sm text-left text-xs font-semibold text-foreground outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      onEditFood(food.uuid);
                                    }}
                                    aria-label={`Открыть карточку продукта: ${food.name}`}
                                    title={food.name}
                                  >
                                    {food.name}
                                  </button>
                                ) : (
                                  <span className="block truncate font-semibold" title={food.name}>{food.name}</span>
                                )}
                                <span className="mt-0.5 block truncate text-[10px] font-normal leading-4 text-muted-foreground">
                                  {[food.category, food.subcategory].filter(Boolean).join(" · ") || "Без категории"}
                                </span>
                              </div>
                              {renderRowAction ? (
                                <fieldset
                                  disabled={!resultsAreCurrent}
                                  className="m-0 inline-flex min-w-0 border-0 p-0"
                                >
                                  {renderRowAction(food)}
                                </fieldset>
                              ) : null}
                            </div>
                          </th>
                          {visibleNutrients.map((nutrient) => {
                            const value = values.get(nutrient.code);
                            return (
                              <td
                                key={nutrient.code}
                                className={cn(
                                  "h-11 py-0 pl-2 pr-4 text-right font-mono text-[11px] tabular-nums",
                                  value == null && "text-muted-foreground/70",
                                )}
                              >
                                {value == null ? "—" : formatMatrixValue(value)}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="grid h-full place-items-center p-4 text-center">{emptyResults}</div>
              )}
            </div>

            <div className="flex min-h-10 shrink-0 flex-col gap-2 border-t bg-card px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[11px] tabular-nums text-muted-foreground">Загружено {rows.length} из {total}</p>
                {matrix.isFetchNextPageError ? (
                  <p className="mt-0.5 text-[11px] text-destructive" role="alert">Не удалось загрузить следующую порцию.</p>
                ) : null}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                disabled={matrix.isPlaceholderData || !matrix.hasNextPage || matrix.isFetchingNextPage}
                onClick={() => void matrix.fetchNextPage()}
              >
                {matrix.isFetchingNextPage ? <Loader2 className="size-3.5 animate-spin" /> : null}
                {matrix.hasNextPage ? "Загрузить ещё" : "Все загружены"}
              </Button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
