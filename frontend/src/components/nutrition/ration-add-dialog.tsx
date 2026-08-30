"use client";

import * as React from "react";
import { Check, Plus, Search, Tags } from "lucide-react";
import {
  CategoryPanel,
  categorySelectionPairs,
  type CategorySelection,
} from "@/components/nutrition/category-panel";
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
import { useDebouncedValue, useFoodCategoriesQuery, useFoodsQuery } from "@/lib/hooks";
import type { FoodCategoryGroupRecord, FoodSummaryRecord } from "@/lib/api-client";
import { apiErrorMessage } from "@/lib/patient-form";

const FEED_FORM_LABEL = {
  dry: "сухой",
  wet: "влажный",
  unknown: "форма не указана",
} as const;

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
  const [selection, setSelection] = React.useState<CategorySelection>(() => new Map());
  const debouncedQuery = useDebouncedValue(query, 250);
  const categories = useFoodCategoriesQuery();
  const categoryPairs = React.useMemo(() => categorySelectionPairs(selection), [selection]);
  const enabled = debouncedQuery.trim().length > 0 || categoryPairs.length > 0;
  const foods = useFoodsQuery(debouncedQuery.trim(), undefined, categoryPairs, enabled && open);
  const existing = React.useMemo(() => new Set(existingFoodIds), [existingFoodIds]);

  function toggleAll(group: FoodCategoryGroupRecord) {
    setSelection((current) => {
      const next = new Map(
        Array.from(current, ([category, subcategories]) => [category, new Set(subcategories)]),
      );
      const selected = next.get(group.category);
      const fullySelected = group.subcategories.length > 0
        && group.subcategories.every((subcategory) => selected?.has(subcategory));
      if (fullySelected) next.delete(group.category);
      else next.set(group.category, new Set(group.subcategories));
      return next;
    });
  }

  function toggleSubcategory(category: string | null, subcategory: string | null, checked: boolean) {
    setSelection((current) => {
      const next = new Map(
        Array.from(current, ([selectedCategory, subcategories]) => [
          selectedCategory,
          new Set(subcategories),
        ]),
      );
      const subcategories = next.get(category) ?? new Set<string | null>();
      if (checked) subcategories.add(subcategory);
      else subcategories.delete(subcategory);
      if (subcategories.size) next.set(category, subcategories);
      else next.delete(category);
      return next;
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto p-0">
        <DialogHeader className="border-b px-5 py-4 pr-12">
          <DialogTitle>Добавить продукт в рацион</DialogTitle>
          <DialogDescription>
            Найдите продукт по названию или выберите одну или несколько категорий и брендов.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5 px-5 pb-5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Поиск по названию"
              className="pl-9"
              aria-label="Поиск Foods по названию"
              autoFocus
            />
          </div>

          <section className="space-y-2.5" aria-labelledby="ration-category-heading">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Tags className="size-4 text-primary" />
                <h3 id="ration-category-heading" className="text-sm font-semibold">Категории и бренды</h3>
              </div>
              {categoryPairs.length ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => setSelection(new Map())}>
                  Сбросить
                </Button>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              Наведите или нажмите категорию, чтобы выбрать подкатегории. «Все» включает всю категорию.
            </p>
            {categories.isPending ? (
              <div className="flex flex-wrap gap-2" aria-busy="true">
                <Skeleton className="h-9 w-36 rounded-full" />
                <Skeleton className="h-9 w-44 rounded-full" />
                <Skeleton className="h-9 w-32 rounded-full" />
              </div>
            ) : categories.isError ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3" role="alert">
                <p className="text-sm text-destructive">{apiErrorMessage(categories.error)}</p>
                <Button type="button" variant="outline" size="sm" onClick={() => void categories.refetch()}>
                  Повторить
                </Button>
              </div>
            ) : (
              <CategoryPanel
                idPrefix="ration-category"
                groups={categories.data ?? []}
                selection={selection}
                onToggleAll={toggleAll}
                onToggleSubcategory={toggleSubcategory}
              />
            )}
          </section>

          <section aria-live="polite">
            {!enabled ? (
              <div className="rounded-xl border border-dashed px-4 py-10 text-center">
                <p className="font-medium">Введите название или выберите категорию</p>
                <p className="mt-1 text-sm text-muted-foreground">Каталог не загружается без фильтра.</p>
              </div>
            ) : foods.isPending ? (
              <div className="space-y-2" aria-busy="true">
                <Skeleton className="h-11 w-full" />
                <Skeleton className="h-11 w-full" />
                <Skeleton className="h-11 w-full" />
              </div>
            ) : foods.isError ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">
                {apiErrorMessage(foods.error)}
              </div>
            ) : (foods.data ?? []).length ? (
              <div className="overflow-hidden rounded-xl border">
                <div className="max-h-80 overflow-auto">
                  <table className="w-full min-w-[620px] text-left text-sm">
                    <thead className="sticky top-0 z-10 border-b bg-muted text-xs text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 font-medium">Продукт</th>
                        <th className="px-3 py-3 font-medium">Категория</th>
                        <th className="px-3 py-3 font-medium">Форма</th>
                        <th className="w-32 px-3 py-3"><span className="sr-only">Добавить</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {(foods.data ?? []).map((food) => {
                        const added = existing.has(food.uuid);
                        return (
                          <tr key={food.uuid} className="border-b last:border-0">
                            <td className="px-4 py-3 font-medium">{food.name}</td>
                            <td className="px-3 py-3 text-muted-foreground">
                              {food.category ?? "Без категории"}
                              {food.subcategory ? ` · ${food.subcategory}` : ""}
                            </td>
                            <td className="px-3 py-3 text-muted-foreground">{FEED_FORM_LABEL[food.feed_form]}</td>
                            <td className="px-3 py-2 text-right">
                              <Button
                                type="button"
                                size="sm"
                                variant={added ? "outline" : "default"}
                                disabled={added}
                                onClick={() => onAdd(food)}
                              >
                                {added ? <Check className="size-4" /> : <Plus className="size-4" />}
                                {added ? "Добавлено" : "Добавить"}
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                По выбранным фильтрам Foods не найдены.
              </div>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
