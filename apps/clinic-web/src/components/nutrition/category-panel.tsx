"use client";

import * as React from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { FoodCategoryGroupRecord, FoodCategoryPair } from "@/lib/api-client";
import { cn } from "@/lib/utils";

export type CategorySelection = Map<string | null, Set<string | null>>;

export function categorySelectionPairs(
  selection: CategorySelection,
  groups: FoodCategoryGroupRecord[] = [],
): FoodCategoryPair[] {
  const groupsByCategory = new Map(groups.map((group) => [group.category, group]));

  return Array.from(selection, ([category, subcategories]) => {
    const group = groupsByCategory.get(category);
    const fullySelected = Boolean(
      group?.subcategories.length
      && group.subcategories.every((subcategory) => subcategories.has(subcategory)),
    );
    if (fullySelected) {
      return [{ category, subcategory: null, allSubcategories: true }];
    }
    return Array.from(subcategories, (subcategory) => ({ category, subcategory }));
  }).flat();
}

export function categoryLabel(category: string | null): string {
  return category ?? "Без категории";
}

export function subcategoryLabel(subcategory: string | null): string {
  return subcategory ?? "Без подкатегории";
}

function categoryKey(category: string | null): string {
  return category === null ? "null" : `value:${category}`;
}

export function CategoryPanel({
  groups,
  selection,
  onToggleAll,
  onToggleSubcategory,
  onClearCategory,
  idPrefix = "food-category",
}: {
  groups: FoodCategoryGroupRecord[];
  selection: CategorySelection;
  onToggleAll: (group: FoodCategoryGroupRecord) => void;
  onToggleSubcategory: (
    category: string | null,
    subcategory: string | null,
    checked: boolean,
  ) => void;
  onClearCategory: (category: string | null) => void;
  idPrefix?: string;
}) {
  const [openKey, setOpenKey] = React.useState<string | null>(null);
  const [subcategoryQuery, setSubcategoryQuery] = React.useState("");

  if (!groups.length) {
    return (
      <p className="text-xs text-muted-foreground">
        Категории появятся после импорта или создания продукта.
      </p>
    );
  }

  return (
    <div className="flex min-w-max flex-wrap gap-1.5 xl:flex-nowrap" aria-label="Категории каталога">
      {groups.map((group, groupIndex) => {
        const key = categoryKey(group.category);
        const selected = selection.get(group.category);
        const selectedCount = selected?.size ?? 0;
        const fullySelected = group.subcategories.length > 0
          && group.subcategories.every((subcategory) => selected?.has(subcategory));
        const partiallySelected = selectedCount > 0 && !fullySelected;
        const active = selectedCount > 0;
        const allId = `${idPrefix}-all-${groupIndex}`;
        const normalizedQuery = subcategoryQuery.trim().toLocaleLowerCase("ru-RU");
        const visibleSubcategories = normalizedQuery
          ? group.subcategories.filter((subcategory) => (
            subcategoryLabel(subcategory).toLocaleLowerCase("ru-RU").includes(normalizedQuery)
          ))
          : group.subcategories;

        return (
          <Popover
            key={key}
            open={openKey === key}
            onOpenChange={(open) => {
              setOpenKey(open ? key : null);
              setSubcategoryQuery("");
            }}
          >
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold outline-none transition-colors",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  active
                    ? "border-primary/35 bg-accent text-accent-foreground hover:bg-accent/75"
                    : "bg-card text-foreground hover:border-primary/35 hover:bg-muted/55",
                )}
                aria-label={`Фильтр категории: ${categoryLabel(group.category)}`}
              >
                {active ? <Check className="size-3.5 text-primary" aria-hidden="true" /> : null}
                <span>{categoryLabel(group.category)}</span>
                {group.subcategories.length ? (
                  <span className={cn("font-medium", active ? "text-primary" : "text-muted-foreground")}>
                    · {active ? selectedCount : group.subcategories.length}
                  </span>
                ) : null}
                <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              sideOffset={7}
              className="w-[min(22rem,calc(100vw-1.5rem))] rounded-xl p-0 shadow-[0_16px_38px_-24px_oklch(0.24_0.035_175_/_0.45)]"
            >
              <div className="flex items-start justify-between gap-3 border-b px-3.5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{categoryLabel(group.category)}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Выбрано {selectedCount} из {group.subcategories.length}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={!active}
                  onClick={() => onClearCategory(group.category)}
                >
                  Очистить
                </Button>
              </div>

              <div className="p-2.5">
                <div className="relative mb-2">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="search"
                    value={subcategoryQuery}
                    onChange={(event) => setSubcategoryQuery(event.target.value)}
                    placeholder="Найти подкатегорию"
                    className="h-8 pl-8 text-xs"
                    aria-label={`Поиск в категории ${categoryLabel(group.category)}`}
                  />
                </div>

                <div className="mb-1 flex min-h-9 items-center gap-2 rounded-lg bg-muted/55 px-2.5">
                  <Checkbox
                    id={allId}
                    checked={partiallySelected ? "indeterminate" : fullySelected}
                    onCheckedChange={() => onToggleAll(group)}
                    aria-label={`Выбрать всю категорию: ${categoryLabel(group.category)}`}
                  />
                  <Label htmlFor={allId} className="min-w-0 flex-1 cursor-pointer text-xs font-semibold">
                    Вся категория
                  </Label>
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {group.subcategories.length}
                  </span>
                </div>

                <div
                  className="scrollbar-thin max-h-64 space-y-0.5 overflow-y-auto"
                  role="group"
                  aria-label="Подкатегории"
                >
                  {visibleSubcategories.map((subcategory) => {
                    const subcategoryIndex = group.subcategories.indexOf(subcategory);
                    const subcategoryValueKey = subcategory === null ? "null" : `value:${subcategory}`;
                    const id = `${allId}-${subcategoryIndex}`;
                    const checked = selected?.has(subcategory) ?? false;
                    return (
                      <div
                        key={subcategoryValueKey}
                        className="flex min-h-9 items-center gap-2 rounded-lg px-2.5 hover:bg-accent/70"
                      >
                        <Checkbox
                          id={id}
                          checked={checked}
                          onCheckedChange={(value) => (
                            onToggleSubcategory(group.category, subcategory, value === true)
                          )}
                        />
                        <Label htmlFor={id} className="min-w-0 flex-1 cursor-pointer truncate text-xs font-normal">
                          {subcategoryLabel(subcategory)}
                        </Label>
                      </div>
                    );
                  })}
                  {!visibleSubcategories.length ? (
                    <p className="px-2.5 py-6 text-center text-xs text-muted-foreground">
                      Ничего не найдено
                    </p>
                  ) : null}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        );
      })}
    </div>
  );
}
