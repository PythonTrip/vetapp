"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
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

function categoryLabel(category: string | null): string {
  return category ?? "Без категории";
}

function subcategoryLabel(subcategory: string | null): string {
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
  idPrefix?: string;
}) {
  const [openKey, setOpenKey] = React.useState<string | null>(null);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = React.useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }, []);

  const scheduleClose = React.useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpenKey(null), 160);
  }, [cancelClose]);

  React.useEffect(() => () => cancelClose(), [cancelClose]);

  if (!groups.length) {
    return (
      <div className="rounded-xl border border-dashed bg-card px-4 py-6 text-sm text-muted-foreground">
        Категории появятся после импорта или создания продукта.
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2" aria-label="Категории каталога">
      {groups.map((group, groupIndex) => {
        const key = categoryKey(group.category);
        const selected = selection.get(group.category);
        const selectedCount = selected?.size ?? 0;
        const fullySelected = group.subcategories.length > 0
          && group.subcategories.every((subcategory) => selected?.has(subcategory));
        const partiallySelected = selectedCount > 0 && !fullySelected;
        const active = selectedCount > 0;
        const allId = `${idPrefix}-all-${groupIndex}`;

        return (
          <Popover
            key={key}
            open={openKey === key}
            onOpenChange={(open) => {
              cancelClose();
              setOpenKey(open ? key : null);
            }}
          >
            <div
              className={cn(
                "flex h-9 items-center overflow-hidden rounded-full border bg-card shadow-xs transition-colors",
                active ? "border-primary/50 bg-accent text-accent-foreground" : "hover:border-primary/35",
              )}
              onMouseEnter={() => {
                cancelClose();
                setOpenKey(key);
              }}
              onMouseLeave={scheduleClose}
            >
              <div className="flex h-full items-center gap-1.5 border-r px-2.5">
                <Checkbox
                  id={allId}
                  checked={partiallySelected ? "indeterminate" : fullySelected}
                  onCheckedChange={() => onToggleAll(group)}
                  aria-label={`Выбрать все подкатегории: ${categoryLabel(group.category)}`}
                />
                <Label htmlFor={allId} className="cursor-pointer text-[11px] font-semibold text-muted-foreground">
                  Все
                </Label>
              </div>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex h-full items-center gap-1.5 px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  aria-label={`Открыть подкатегории: ${categoryLabel(group.category)}`}
                >
                  <span>{categoryLabel(group.category)}</span>
                  {active ? (
                    <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] leading-none text-primary-foreground">
                      {selectedCount}
                    </span>
                  ) : null}
                  <ChevronDown className="size-3.5 text-muted-foreground" />
                </button>
              </PopoverTrigger>
            </div>
            <PopoverContent
              align="start"
              sideOffset={8}
              className="w-72 rounded-xl p-2 shadow-[0_12px_34px_-26px_oklch(0.25_0.04_175_/_0.38)]"
              onMouseEnter={cancelClose}
              onMouseLeave={scheduleClose}
            >
              <div className="border-b px-2 pb-2 pt-1">
                <p className="font-semibold">{categoryLabel(group.category)}</p>
                <p className="text-xs text-muted-foreground">Выберите одну или несколько подкатегорий</p>
              </div>
              <div className="max-h-64 space-y-0.5 overflow-y-auto py-1" role="group" aria-label="Подкатегории">
                {group.subcategories.map((subcategory, subcategoryIndex) => {
                  const subcategoryKey = subcategory === null ? "null" : `value:${subcategory}`;
                  const id = `${allId}-${subcategoryIndex}`;
                  const checked = selected?.has(subcategory) ?? false;
                  return (
                    <div
                      key={subcategoryKey}
                      className="flex min-h-9 items-center gap-2 rounded-lg px-2 hover:bg-accent"
                    >
                      <Checkbox
                        id={id}
                        checked={checked}
                        onCheckedChange={(value) => onToggleSubcategory(group.category, subcategory, value === true)}
                      />
                      <Label htmlFor={id} className="min-w-0 flex-1 cursor-pointer truncate font-normal">
                        {subcategoryLabel(subcategory)}
                      </Label>
                    </div>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        );
      })}
    </div>
  );
}
