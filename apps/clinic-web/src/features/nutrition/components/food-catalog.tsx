"use client";

import * as React from "react";
import { Info, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { FoodCatalogBrowse, type FoodCatalogFilters } from "@/features/nutrition/components/food-catalog-browse";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Skeleton } from "@/shared/ui/skeleton";
import { useCreateFood, useFoodQuery, useNutrientsQuery, useReplaceFoodNutrients, useUpdateFood } from "@/features/nutrition/hooks";
import type { FeedForm, FoodNutrientValueWrite, FoodType, FoodWrite, NutrientCategory } from "@/features/nutrition/api";
import { canonicalGroupForCategory, orderedNutrients } from "@/features/nutrition/nutrient-columns";
import { apiErrorMessage } from "@/shared/api/error-message";

const TYPE_OPTIONS: { value: FoodType; label: string }[] = [
  { value: "commercial", label: "Готовый корм" },
  { value: "ingredient", label: "Ингредиент" },
  { value: "supplement", label: "Добавка" },
];

const FEED_FORM_OPTIONS: { value: FeedForm; label: string }[] = [
  { value: "dry", label: "Сухой" },
  { value: "wet", label: "Влажный" },
  { value: "unknown", label: "Не указан" },
];

const CATEGORY_LABELS: Record<NutrientCategory, string> = {
  main: "Основные показатели",
  mineral: "Минералы",
  vitamin: "Витамины",
  amino_acid: "Аминокислоты",
  fatty_acid: "Жирные кислоты",
};

export function FoodCatalog(filters: FoodCatalogFilters) {
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);

  function createFood() {
    setEditingId(null);
    setEditorOpen(true);
  }

  function editFood(id: string) {
    setEditingId(id);
    setEditorOpen(true);
  }

  return (
    <div className="w-full min-w-0 space-y-2.5 lg:flex lg:h-[calc(100dvh-12rem)] lg:min-h-0 lg:flex-col lg:gap-2.5 lg:space-y-0 lg:overflow-hidden">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-lg font-bold tracking-[-0.02em] sm:text-xl">Каталог продуктов</h2>
            <Popover>
              <PopoverTrigger asChild>
                <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs text-muted-foreground">
                  <Info className="size-3.5" />
                  О данных
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72 rounded-xl p-3 text-xs leading-5">
                <p className="font-semibold text-foreground">Нутриенты на 100 г продукта</p>
                <p className="mt-1 text-muted-foreground">
                  Значения показаны «как есть». Знак «—» означает, что данных нет; 0 — известный ноль.
                  ME отображается в ккал / 100 г.
                </p>
              </PopoverContent>
            </Popover>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">Нутриентный состав продуктов на 100 г</p>
        </div>
        <Button type="button" size="sm" className="h-8 shrink-0" onClick={createFood}>
          <Plus className="size-3.5" />
          Создать продукт
        </Button>
      </div>

      <FoodCatalogBrowse {...filters} onEditFood={editFood} selectedFoodId={editorOpen ? editingId : null} />
      <FoodEditorDialog open={editorOpen} editingId={editingId} onOpenChange={setEditorOpen} />
    </div>
  );
}

type FoodFormState = {
  name: string;
  type: FoodType;
  feed_form: FeedForm;
  category: string;
  subcategory: string;
  nutrientValues: Record<string, string>;
};

function emptyForm(): FoodFormState {
  return {
    name: "",
    type: "commercial",
    feed_form: "unknown",
    category: "",
    subcategory: "",
    nutrientValues: {},
  };
}

function FoodEditorDialog({
  open,
  editingId,
  onOpenChange,
}: {
  open: boolean;
  editingId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const food = useFoodQuery(open ? editingId : null);
  const nutrients = useNutrientsQuery();
  const createFood = useCreateFood();
  const updateFood = useUpdateFood();
  const replaceNutrients = useReplaceFoodNutrients();
  const [values, setValues] = React.useState<FoodFormState>(emptyForm);
  const [persistedId, setPersistedId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const pending = createFood.isPending || updateFood.isPending || replaceNutrients.isPending;
  const loadingFood = Boolean(editingId) && food.isPending;

  React.useEffect(() => {
    if (!open) return;
    setPersistedId(editingId);
    setError(null);
    if (!editingId) setValues(emptyForm());
  }, [open, editingId]);

  React.useEffect(() => {
    if (!open || !food.data || food.data.uuid !== editingId) return;
    setValues({
      name: food.data.name,
      type: food.data.type,
      feed_form: food.data.feed_form,
      category: food.data.category ?? "",
      subcategory: food.data.subcategory ?? "",
      nutrientValues: Object.fromEntries(
        food.data.nutrient_values
          .filter((item) => item.basis === "per_100g_as_fed" && item.value !== null)
          .map((item) => [item.code, String(item.value)]),
      ),
    });
  }, [open, editingId, food.data]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const name = values.name.trim();
    if (!name) {
      setError("Укажите название продукта");
      return;
    }
    if (!nutrients.data) {
      setError("Справочник нутриентов ещё не загружен");
      return;
    }

    const nutrientPayload: FoodNutrientValueWrite[] = [];
    for (const nutrient of nutrients.data) {
      const raw = values.nutrientValues[nutrient.code]?.trim() ?? "";
      if (!raw) continue;
      const numeric = Number(raw.replace(",", "."));
      if (!Number.isFinite(numeric) || numeric < 0) {
        setError(`Проверьте значение «${nutrient.code}»: требуется неотрицательное число`);
        return;
      }
      if (nutrient.code === "ME" && numeric > 1000) {
        setError("ME указывается в ккал / 100 г и не может превышать 1000.");
        return;
      }
      nutrientPayload.push({ code: nutrient.code, value: numeric, value_status: "measured" });
    }

    const foodPayload: FoodWrite = {
      name,
      type: values.type,
      feed_form: values.feed_form,
      category: values.category.trim() || null,
      subcategory: values.subcategory.trim() || null,
    };

    try {
      let id = persistedId;
      if (id) {
        await updateFood.mutateAsync({ id, body: foodPayload });
      } else {
        const created = await createFood.mutateAsync(foodPayload);
        id = created.uuid;
        setPersistedId(id);
      }
      await replaceNutrients.mutateAsync({ id, body: nutrientPayload });
      toast.success("Продукт и нутриенты сохранены");
      onOpenChange(false);
    } catch (cause) {
      setError(apiErrorMessage(cause));
    }
  }

  const loadError = food.isError ? apiErrorMessage(food.error) : nutrients.isError ? apiErrorMessage(nutrients.error) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="bg-foreground/15 backdrop-blur-[1px]"
        className="bottom-0 left-auto right-0 top-0 h-dvh w-full max-w-[480px] translate-x-0 translate-y-0 gap-0 overflow-y-auto rounded-none border-y-0 border-r-0 p-0 shadow-[0_0_42px_-22px_oklch(0.2_0.04_175_/_0.55)] duration-300 sm:max-w-[480px] data-[state=closed]:slide-out-to-right-full data-[state=closed]:zoom-out-100 data-[state=open]:slide-in-from-right-full data-[state=open]:zoom-in-100"
      >
        <form onSubmit={onSubmit} className="flex min-h-full flex-col">
          <DialogHeader className="sticky top-0 z-20 border-b bg-background/95 px-4 py-4 pr-12 text-left backdrop-blur-sm sm:px-5">
            <DialogTitle>{editingId ? "Карточка продукта" : "Новый продукт"}</DialogTitle>
            <DialogDescription>
              {editingId ? "Данные продукта и нутриенты на 100 г." : "Добавьте продукт и его нутриентный состав."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 space-y-5 px-4 py-4 sm:px-5">
            {loadingFood || nutrients.isPending ? (
              <div className="space-y-3" aria-busy="true">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            ) : loadError ? (
              <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">
                {loadError}
              </p>
            ) : (
              <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="food-name">Название</Label>
                  <Input
                    id="food-name"
                    value={values.name}
                    onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))}
                    disabled={pending}
                    autoFocus={!editingId}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Тип</Label>
                  <Select
                    value={values.type}
                    onValueChange={(value) => setValues((current) => ({ ...current, type: value as FoodType }))}
                    disabled={pending}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TYPE_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Форма корма</Label>
                  <Select
                    value={values.feed_form}
                    onValueChange={(value) => setValues((current) => ({ ...current, feed_form: value as FeedForm }))}
                    disabled={pending}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FEED_FORM_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="food-category">Категория</Label>
                  <Input
                    id="food-category"
                    value={values.category}
                    onChange={(event) => setValues((current) => ({ ...current, category: event.target.value }))}
                    placeholder="Например, сухие корма"
                    disabled={pending}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="food-subcategory">Подкатегория</Label>
                  <Input
                    id="food-subcategory"
                    value={values.subcategory}
                    onChange={(event) => setValues((current) => ({ ...current, subcategory: event.target.value }))}
                    disabled={pending}
                  />
                </div>
              </div>

              <div className="space-y-4 rounded-2xl border bg-muted/20 p-4">
                <div>
                  <h3 className="font-semibold">Нутриенты на 100 г as fed</h3>
                  <p className="text-xs text-muted-foreground">
                    Пусто = NULL · 0 = известный ноль · ME в ккал / 100 г
                  </p>
                </div>
                {(Object.keys(CATEGORY_LABELS) as NutrientCategory[]).map((category) => {
                  const categoryNutrients = nutrients.data?.filter((nutrient) => nutrient.category === category) ?? [];
                  const canonicalGroup = canonicalGroupForCategory(category);
                  const orderedCategoryNutrients = canonicalGroup
                    ? orderedNutrients(categoryNutrients, canonicalGroup)
                    : categoryNutrients;
                  if (!orderedCategoryNutrients.length) return null;
                  return (
                    <section key={category} className="space-y-2">
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {CATEGORY_LABELS[category]}
                      </h4>
                      <div className="grid gap-2">
                        {orderedCategoryNutrients.map((nutrient) => (
                          <label key={nutrient.code} className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2">
                            <span className="w-10 shrink-0 font-mono text-xs font-semibold">{nutrient.code}</span>
                            <Input
                              type="text"
                              inputMode="decimal"
                              value={values.nutrientValues[nutrient.code] ?? ""}
                              onChange={(event) => setValues((current) => ({
                                ...current,
                                nutrientValues: { ...current.nutrientValues, [nutrient.code]: event.target.value },
                              }))}
                              placeholder="пусто"
                              aria-label={`${nutrient.name}, ${nutrient.base_unit}`}
                              className="h-8 min-w-0"
                              disabled={pending}
                            />
                            <span className="w-[4.75rem] shrink-0 text-[11px] text-muted-foreground">
                              {nutrient.base_unit}
                            </span>
                          </label>
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
              </>
            )}

            {error ? (
              <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <DialogFooter className="sticky bottom-0 z-20 border-t bg-background/95 px-4 py-3 backdrop-blur-sm sm:px-5">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Отмена
            </Button>
            <Button type="submit" disabled={pending || loadingFood || Boolean(loadError) || nutrients.isPending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Сохранить
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
