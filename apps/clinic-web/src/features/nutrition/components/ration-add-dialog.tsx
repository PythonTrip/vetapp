"use client";

import * as React from "react";
import { Check, Plus } from "lucide-react";
import type { FoodSummaryRecord } from "@/features/nutrition/api";
import type { CategorySelection } from "@/features/nutrition/components/category-panel";
import { FoodCatalogBrowse } from "@/features/nutrition/components/food-catalog-browse";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/shared/ui/dialog";

type RationAddDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingFoodIds: string[];
  onAdd: (food: FoodSummaryRecord) => void;
};

export function RationAddDialog({ open, onOpenChange, existingFoodIds, onAdd }: RationAddDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[90dvh] w-[90vw] max-w-none flex-col gap-0 p-0 sm:max-w-none">
        <DialogHeader className="shrink-0 border-b px-4 py-4 pr-12 text-left">
          <DialogTitle className="text-base">Добавить продукт</DialogTitle>
          <DialogDescription className="sr-only">
            Поиск и последовательное добавление продуктов в рацион.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <RationCatalog existingFoodIds={existingFoodIds} onAdd={onAdd} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RationCatalog({ existingFoodIds, onAdd }: Pick<RationAddDialogProps, "existingFoodIds" | "onAdd">) {
  const [query, setQuery] = React.useState("");
  const [selection, setSelection] = React.useState<CategorySelection>(() => new Map());
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const existing = new Set(existingFoodIds);

  return (
    <div className="flex min-h-0 flex-1 p-2 sm:p-3">
      <FoodCatalogBrowse
        inDialog
        query={query}
        setQuery={setQuery}
        selection={selection}
        setSelection={setSelection}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        renderRowAction={(food) => {
          const added = existing.has(food.uuid);
          return (
            <Button
              type="button"
              size="icon"
              variant={added ? "secondary" : "outline"}
              className="size-7 shrink-0"
              disabled={added}
              onClick={() => {
                const { uuid, name, type, feed_form, category, subcategory, created_at, updated_at } = food;
                onAdd({ uuid, name, type, feed_form, category, subcategory, created_at, updated_at });
              }}
              aria-label={added ? `${food.name} уже добавлен` : `Добавить ${food.name}`}
            >
              {added ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
            </Button>
          );
        }}
      />
    </div>
  );
}
