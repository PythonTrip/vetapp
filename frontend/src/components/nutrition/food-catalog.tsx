"use client";

import * as React from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Loader2,
  Plus,
  Search,
  Tags,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  CategoryPanel,
  categorySelectionPairs,
  type CategorySelection,
} from "@/components/nutrition/category-panel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useCreateFood,
  useDebouncedValue,
  useFoodCategoriesQuery,
  useFoodMatrixQuery,
  useFoodQuery,
  useNutrientsQuery,
  useReplaceFoodNutrients,
  useUpdateFood,
} from "@/lib/hooks";
import type {
  FeedForm,
  FoodCategoryGroupRecord,
  FoodMatrixSortDirection,
  FoodNutrientValueWrite,
  FoodType,
  FoodWrite,
  NutrientCategory,
} from "@/lib/api-client";
import { apiErrorMessage } from "@/lib/patient-form";

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

const MATRIX_TABS: { value: NutrientCategory; label: string }[] = [
  { value: "main", label: "Основные" },
  { value: "mineral", label: "Минералы" },
  { value: "vitamin", label: "Витамины" },
  { value: "amino_acid", label: "Аминокислоты" },
  { value: "fatty_acid", label: "Жирные кислоты" },
];

function formatMatrixValue(value: number): string {
  return value.toLocaleString("ru-RU", { maximumFractionDigits: 6 });
}

function SortIcon({ active, direction }: { active: boolean; direction: FoodMatrixSortDirection }) {
  if (!active) return <ArrowUpDown className="size-3.5 opacity-45" />;
  return direction === "asc"
    ? <ArrowUp className="size-3.5 text-primary" />
    : <ArrowDown className="size-3.5 text-primary" />;
}

export function FoodCatalog() {
  const [query, setQuery] = React.useState("");
  const [selection, setSelection] = React.useState<CategorySelection>(() => new Map());
  const [nutrientCategory, setNutrientCategory] = React.useState<NutrientCategory>("main");
  const [sort, setSort] = React.useState<{ field: string; direction: FoodMatrixSortDirection }>({
    field: "name",
    direction: "asc",
  });
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const debouncedQuery = useDebouncedValue(query, 300);
  const categories = useFoodCategoriesQuery();
  const nutrients = useNutrientsQuery();
  const categoryPairs = React.useMemo(() => categorySelectionPairs(selection), [selection]);
  const visibleNutrients = React.useMemo(
    () => (nutrients.data ?? []).filter(
      (nutrient) => nutrient.category === nutrientCategory && nutrient.is_active,
    ),
    [nutrientCategory, nutrients.data],
  );
  const hasActiveFilters = query.trim().length > 0 || categoryPairs.length > 0;
  const listEnabled = debouncedQuery.trim().length > 0 || categoryPairs.length > 0;
  const matrix = useFoodMatrixQuery({
    q: debouncedQuery,
    categoryPairs,
    nutrientCategory,
    sort: sort.field,
    sortDir: sort.direction,
  }, listEnabled);
  const rows = matrix.data?.pages.flatMap((page) => page.items) ?? [];
  const total = matrix.data?.pages[0]?.total ?? 0;

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

  function createFood() {
    setEditingId(null);
    setEditorOpen(true);
  }

  function editFood(id: string) {
    setEditingId(id);
    setEditorOpen(true);
  }

  return (
    <div className="w-full space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Каталог продуктов</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Готовые корма, ингредиенты и добавки используют один справочник нутриентов.
            Пустое значение означает отсутствие данных, а 0 — известный ноль.
          </p>
        </div>
        <Button type="button" onClick={createFood}>
          <Plus className="h-4 w-4" />
          Создать продукт
        </Button>
      </div>

      <div className="space-y-4 rounded-2xl border bg-card p-4 sm:p-5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск по названию"
            className="pl-9"
            aria-label="Поиск продуктов"
          />
        </div>
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Tags className="size-4 text-primary" />
              <h2 className="text-sm font-semibold">Категории и бренды</h2>
            </div>
            {categoryPairs.length ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setSelection(new Map())}>
                Сбросить
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            Наведите или нажмите категорию, чтобы выбрать бренды. «Все» включает всю категорию.
          </p>
          {categories.isPending ? (
            <div className="flex flex-wrap gap-2" aria-busy="true">
              <Skeleton className="h-9 w-36 rounded-full" />
              <Skeleton className="h-9 w-44 rounded-full" />
              <Skeleton className="h-9 w-32 rounded-full" />
            </div>
          ) : categories.isError ? (
            <div className="flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between" role="alert">
              <p className="text-sm text-destructive">{apiErrorMessage(categories.error)}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => void categories.refetch()}>
                Повторить
              </Button>
            </div>
          ) : (
            <CategoryPanel
              groups={categories.data ?? []}
              selection={selection}
              onToggleAll={toggleAll}
              onToggleSubcategory={toggleSubcategory}
            />
          )}
        </div>
      </div>

      <Tabs value={nutrientCategory} onValueChange={changeNutrientCategory}>
        <TabsList className="h-auto w-full justify-start overflow-x-auto rounded-xl bg-muted/60 p-1">
          {MATRIX_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="shrink-0">
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {!hasActiveFilters ? (
        <div className="rounded-2xl border border-dashed bg-card px-4 py-12 text-center">
          <p className="font-medium">Выберите категорию или введите название</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Таблица останется пустой, пока не задан фильтр.
          </p>
        </div>
      ) : !listEnabled || matrix.isPending || nutrients.isPending ? (
        <div className="overflow-hidden rounded-2xl border bg-card" aria-busy="true">
          <Skeleton className="h-11 w-full rounded-none" />
          <div className="space-y-px p-px">
            <Skeleton className="h-12 w-full rounded-none" />
            <Skeleton className="h-12 w-full rounded-none" />
            <Skeleton className="h-12 w-full rounded-none" />
            <Skeleton className="h-12 w-full rounded-none" />
          </div>
        </div>
      ) : matrix.isError || nutrients.isError ? (
        <div className="flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between" role="alert">
          <p className="text-sm text-destructive">
            {apiErrorMessage(matrix.error ?? nutrients.error)}
          </p>
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
      ) : !rows.length ? (
        <div className="rounded-2xl border border-dashed bg-card px-4 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            {debouncedQuery.trim()
              ? `По запросу «${debouncedQuery.trim()}» ничего не найдено.`
              : "По выбранным категориям ничего не найдено."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="overflow-hidden rounded-2xl border bg-card">
            <div className="overflow-x-auto">
              <table className="w-full min-w-max border-collapse text-left text-sm">
                <thead className="border-b bg-muted/65 text-xs text-muted-foreground">
                  <tr>
                    <th
                      className="sticky left-0 z-20 min-w-44 border-r bg-muted px-3 py-3 sm:min-w-56 sm:px-4 lg:min-w-72"
                      aria-sort={sort.field === "name" ? "ascending" : "none"}
                    >
                      <button
                        type="button"
                        className="flex items-center gap-1.5 font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => setSort({ field: "name", direction: "asc" })}
                        title="Сортировать по названию"
                      >
                        Название
                        {sort.field === "name" ? <ArrowUp className="size-3.5 text-primary" /> : null}
                      </button>
                    </th>
                    {visibleNutrients.map((nutrient) => (
                      <th
                        key={nutrient.code}
                        className="min-w-24 px-3 py-3 text-right"
                        title={nutrient.name}
                        aria-sort={sort.field === nutrient.code
                          ? sort.direction === "asc" ? "ascending" : "descending"
                          : "none"}
                      >
                        <button
                          type="button"
                          className="ml-auto flex items-center gap-1.5 font-mono font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() => toggleNutrientSort(nutrient.code)}
                          aria-label={`Сортировать по ${nutrient.name}`}
                        >
                          {nutrient.code}
                          <SortIcon active={sort.field === nutrient.code} direction={sort.direction} />
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((food) => {
                    const values = new Map(food.nutrient_values.map((item) => [item.code, item.value]));
                    return (
                      <tr
                        key={food.uuid}
                        className="group cursor-pointer border-b last:border-b-0 hover:bg-muted/35"
                        onClick={() => editFood(food.uuid)}
                      >
                        <th
                          scope="row"
                          className="sticky left-0 z-10 max-w-96 min-w-44 border-r bg-card px-3 py-3 text-left font-medium group-hover:bg-muted sm:min-w-56 sm:px-4 lg:min-w-72"
                        >
                          <button
                            type="button"
                            className="block max-w-full truncate text-left font-medium text-foreground outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
                            onClick={(event) => {
                              event.stopPropagation();
                              editFood(food.uuid);
                            }}
                            aria-label={`Редактировать продукт: ${food.name}`}
                          >
                            {food.name}
                          </button>
                          <span className="mt-0.5 block truncate text-[11px] font-normal text-muted-foreground">
                            {[food.category, food.subcategory].filter(Boolean).join(" · ") || "Без категории"}
                          </span>
                        </th>
                        {visibleNutrients.map((nutrient) => {
                          const value = values.get(nutrient.code);
                          return (
                            <td key={nutrient.code} className="px-3 py-3 text-right font-mono text-xs tabular-nums">
                              {value == null ? "" : formatMatrixValue(value)}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {matrix.isFetchNextPageError ? (
            <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">
              Не удалось загрузить следующую порцию. Повторите попытку.
            </p>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Загружено {rows.length} из {total}
            </p>
            <Button
              type="button"
              variant="outline"
              disabled={!matrix.hasNextPage || matrix.isFetchingNextPage}
              onClick={() => void matrix.fetchNextPage()}
            >
              {matrix.isFetchingNextPage ? <Loader2 className="size-4 animate-spin" /> : null}
              {matrix.hasNextPage ? "Загрузить ещё" : "Все загружены"}
            </Button>
          </div>
        </div>
      )}

      <FoodEditorDialog
        open={editorOpen}
        editingId={editingId}
        onOpenChange={setEditorOpen}
      />
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
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <form onSubmit={onSubmit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>{editingId ? "Редактировать продукт" : "Новый продукт"}</DialogTitle>
            <DialogDescription>
              Значения сохраняются на 100 г продукта «как есть». Оставьте поле пустым, если данных нет; введите 0 только для известного нуля.
            </DialogDescription>
          </DialogHeader>

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
                  <h3 className="font-semibold">Нутриенты на 100 г</h3>
                  <p className="text-xs text-muted-foreground">Пусто = NULL · 0 = известный ноль</p>
                </div>
                {(Object.keys(CATEGORY_LABELS) as NutrientCategory[]).map((category) => {
                  const categoryNutrients = nutrients.data?.filter((nutrient) => nutrient.category === category) ?? [];
                  if (!categoryNutrients.length) return null;
                  return (
                    <section key={category} className="space-y-2">
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {CATEGORY_LABELS[category]}
                      </h4>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {categoryNutrients.map((nutrient) => (
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
                            <span className="w-9 shrink-0 text-[11px] text-muted-foreground">{nutrient.base_unit}</span>
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

          <DialogFooter>
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
