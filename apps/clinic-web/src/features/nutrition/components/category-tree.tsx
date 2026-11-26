"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";
import type { FoodCategoryGroupRecord } from "@/features/nutrition/api";
import {
  categoryCheckState,
  categoryLabel,
  subcategoryLabel,
  type CategorySelection,
} from "@/features/nutrition/components/category-selection";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { Label } from "@/shared/ui/label";

export function CategoryTree({
  groups,
  selection,
  expanded,
  onToggleExpanded,
  onToggleCategory,
  onToggleSubcategory,
}: {
  groups: FoodCategoryGroupRecord[];
  selection: CategorySelection;
  expanded: ReadonlySet<string | null>;
  onToggleExpanded: (category: string | null) => void;
  onToggleCategory: (group: FoodCategoryGroupRecord) => void;
  onToggleSubcategory: (category: string | null, subcategory: string | null, checked: boolean) => void;
}) {
  const treeId = React.useId();

  if (!groups.length) {
    return (
      <p className="px-3 py-2 text-xs text-muted-foreground">
        Категории появятся после импорта или создания продукта.
      </p>
    );
  }

  return (
    <ul className="space-y-1 p-2" aria-label="Категории каталога">
      {groups.map((group, index) => {
        const { category, subcategories, food_count } = group;
        const label = categoryLabel(category);
        const id = `${treeId}-${index}`;
        const childrenId = `${id}-children`;
        const selected = selection.get(category);
        const checked = categoryCheckState(group, selected);
        const isExpanded = expanded.has(category);

        return (
          <li key={JSON.stringify(category)}>
            <div className={cn(
              "flex min-h-8 items-center gap-1.5 rounded-md pr-2 hover:bg-muted",
              checked !== false && "bg-accent text-accent-foreground",
            )}>
              {subcategories.length ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-6 shrink-0"
                  aria-label={`${isExpanded ? "Свернуть" : "Развернуть"} ${label}`}
                  aria-expanded={isExpanded}
                  aria-controls={childrenId}
                  onClick={() => onToggleExpanded(category)}
                >
                  <ChevronRight className={cn("size-3.5", isExpanded && "rotate-90")} />
                </Button>
              ) : <span className="w-6 shrink-0" aria-hidden="true" />}
              <Checkbox
                id={id}
                checked={checked}
                onCheckedChange={() => onToggleCategory(group)}
                className="data-[state=indeterminate]:border-primary data-[state=indeterminate]:text-primary data-[state=indeterminate]:after:block data-[state=indeterminate]:after:mx-auto data-[state=indeterminate]:after:h-0.5 data-[state=indeterminate]:after:w-2 data-[state=indeterminate]:after:bg-current data-[state=indeterminate]:[&_[data-slot=checkbox-indicator]]:hidden"
              />
              <Label htmlFor={id} className="min-w-0 flex-1 cursor-pointer break-words py-1.5 text-xs font-medium leading-4">
                {label}
              </Label>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{food_count}</span>
            </div>
            {subcategories.length > 0 && (
              <ul id={childrenId} hidden={!isExpanded} className="ml-[18px] mt-1 space-y-1 border-l pl-2">
                {isExpanded && subcategories.map(({ subcategory, food_count }, childIndex) => {
                  const childId = `${id}-${childIndex}`;
                  const childChecked = selected?.has(subcategory) ?? false;
                  return (
                    <li
                      key={JSON.stringify(subcategory)}
                      className={cn(
                        "flex min-h-8 items-center gap-1.5 rounded-md px-2 hover:bg-muted",
                        childChecked && "bg-accent text-accent-foreground",
                      )}
                    >
                      <Checkbox
                        id={childId}
                        checked={childChecked}
                        onCheckedChange={(value) => onToggleSubcategory(category, subcategory, value === true)}
                      />
                      <Label htmlFor={childId} className="min-w-0 flex-1 cursor-pointer break-words py-1.5 text-xs font-normal leading-4">
                        {subcategoryLabel(subcategory)}
                      </Label>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{food_count}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
