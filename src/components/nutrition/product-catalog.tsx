"use client";

import * as React from "react";
import {
  ArrowUpDown,
  Beef,
  ChevronLeft,
  ChevronRight,
  Cookie,
  Database,
  Droplets,
  Fish,
  FlaskConical,
  FolderTree,
  Leaf,
  Loader2,
  PackageOpen,
  Pill,
  Plus,
  Search,
  Wheat,
} from "lucide-react";
import { toast } from "sonner";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useNutritionProducts } from "@/lib/hooks";
import { useNutritionWorkspace } from "@/lib/nutrition-workspace";
import { productToDietComponent } from "@/lib/nutrition-analysis";
import {
  NUTRIENT_GROUPS,
  NUTRIENT_UNITS,
  NUTRITION_CATEGORIES,
  type NutritionProductDto,
} from "@/lib/nutrition-products";
import { cn } from "@/lib/utils";

const CATEGORY_META = {
  белки: { label: "Белки", icon: Beef, accent: "text-rose-600 bg-rose-500/10" },
  углеводы: { label: "Углеводы", icon: Wheat, accent: "text-amber-600 bg-amber-500/10" },
  жиры: { label: "Жиры", icon: Droplets, accent: "text-yellow-600 bg-yellow-500/10" },
  клетчатка: { label: "Клетчатка", icon: Leaf, accent: "text-emerald-600 bg-emerald-500/10" },
  "сухие корма": { label: "Сухие корма", icon: PackageOpen, accent: "text-orange-600 bg-orange-500/10" },
  "влажные корма": { label: "Влажные корма", icon: Fish, accent: "text-sky-600 bg-sky-500/10" },
  добавки: { label: "Добавки", icon: Pill, accent: "text-violet-600 bg-violet-500/10" },
  лакомства: { label: "Лакомства", icon: Cookie, accent: "text-pink-600 bg-pink-500/10" },
} as const;

function formatValue(value: number) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 }).format(value);
}

function productLabel(count: number) {
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 19) return "позиций";
  if (last === 1) return "позиция";
  if (last >= 2 && last <= 4) return "позиции";
  return "позиций";
}

export function NutritionProductCatalog() {
  const [category, setCategory] = React.useState<string>(NUTRITION_CATEGORIES[0]);
  const [subcategory, setSubcategory] = React.useState("all");
  const [sortBy, setSortBy] = React.useState("name");
  const [sortDirection, setSortDirection] = React.useState("asc");
  const [searchInput, setSearchInput] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [selectedId, setSelectedId] = React.useState<number | null>(null);
  const [showTransitionLoader, setShowTransitionLoader] = React.useState(false);

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const query = useNutritionProducts(category, subcategory, search, page, sortBy, sortDirection);
  const products = query.data?.products ?? [];
  const selected = products.find((product) => product.id === selectedId) ?? products[0] ?? null;
  const catalogTotal = Object.values(query.data?.categoryCounts ?? {}).reduce((sum, count) => sum + count, 0);

  React.useEffect(() => {
    if (!query.isFetching || query.isLoading) {
      setShowTransitionLoader(false);
      return;
    }

    const timer = window.setTimeout(() => setShowTransitionLoader(true), 180);
    return () => window.clearTimeout(timer);
  }, [query.isFetching, query.isLoading]);

  React.useEffect(() => {
    if (products.length > 0 && !products.some((product) => product.id === selectedId)) {
      setSelectedId(products[0].id);
    }
  }, [products, selectedId]);

  function chooseCategory(nextCategory: string) {
    setCategory(nextCategory);
    setSubcategory("all");
    setPage(1);
    setSelectedId(null);
  }

  function chooseSubcategory(value: string) {
    setSubcategory(value);
    setPage(1);
    setSelectedId(null);
  }

  function chooseSortBy(value: string) {
    setSortBy(value);
    setPage(1);
    setSelectedId(null);
  }

  function chooseSortDirection(value: string) {
    setSortDirection(value);
    setPage(1);
    setSelectedId(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Database className="h-4 w-4 text-primary" /> Каталог рационов и добавок
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {catalogTotal > 0 ? `${catalogTotal} ${productLabel(catalogTotal)}` : "Каталог загружается"} из локальной SQLite-базы · исходные и рассчитанные показатели
          </p>
        </div>
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Поиск в категории…"
            className="pl-9"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        {NUTRITION_CATEGORIES.map((item) => {
          const meta = CATEGORY_META[item];
          const Icon = meta.icon;
          const active = category === item;
          return (
            <button
              key={item}
              type="button"
              onClick={() => chooseCategory(item)}
              className={cn(
                "group rounded-xl border bg-card p-3 text-left transition-all hover:border-primary/40 hover:shadow-sm",
                active && "border-primary bg-primary/5 ring-1 ring-primary/20",
              )}
            >
              <span className={cn("mb-2 flex h-8 w-8 items-center justify-center rounded-lg", meta.accent)}>
                <Icon className="h-4 w-4" />
              </span>
              <span className="block truncate text-xs font-semibold">{meta.label}</span>
              <span className="mt-0.5 block text-[10px] text-muted-foreground">
                {query.data?.categoryCounts[item] ?? "—"}{query.data ? ` ${productLabel(query.data.categoryCounts[item])}` : ""}
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-3 rounded-xl border bg-card p-3 shadow-sm sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(150px,0.6fr)]">
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <FolderTree className="h-3.5 w-3.5" /> Подкаталог
          </label>
          <Select value={subcategory} onValueChange={chooseSubcategory}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Все подкаталоги" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                Все подкаталоги ({query.data?.categoryCounts[category] ?? 0})
              </SelectItem>
              {(query.data?.subcategories ?? []).map((item) => (
                <SelectItem key={item.name} value={item.name}>
                  {item.name} ({item.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <ArrowUpDown className="h-3.5 w-3.5" /> Сортировка
          </label>
          <Select value={sortBy} onValueChange={chooseSortBy}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Имя</SelectItem>
              {NUTRIENT_GROUPS.map((group) => (
                <SelectGroup key={group.id}>
                  <SelectLabel>{group.label}</SelectLabel>
                  {group.codes.map((code) => (
                    <SelectItem key={code} value={code}>{code}</SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Направление</label>
          <Select value={sortDirection} onValueChange={chooseSortDirection}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="asc">По возрастанию</SelectItem>
              <SelectItem value="desc">По убыванию</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {query.isError ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Database className="mx-auto mb-3 h-8 w-8 text-destructive" />
            <p className="text-sm font-medium">Каталог не загрузился</p>
            <p className="mt-1 text-xs text-muted-foreground">{query.error.message}</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => query.refetch()}>Повторить</Button>
          </CardContent>
        </Card>
      ) : query.isLoading ? (
        <CatalogInitialLoader />
      ) : (
        <div className="relative">
          <div className={cn(
            "grid gap-4 transition-[filter,opacity] duration-300 lg:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.75fr)]",
            showTransitionLoader && "pointer-events-none select-none opacity-70 blur-[1px]",
          )}>
          <Card className="min-w-0">
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <div>
                <CardTitle className="text-base">
                  {subcategory === "all" ? CATEGORY_META[category as keyof typeof CATEGORY_META].label : subcategory}
                </CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  {`${query.data?.total ?? 0} найдено`}
                </p>
              </div>
            </CardHeader>
            <CardContent>
              {products.length === 0 ? (
                <div className="py-16 text-center">
                  <Search className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
                  <p className="text-sm font-medium">Ничего не найдено</p>
                  <p className="mt-1 text-xs text-muted-foreground">Попробуйте изменить поисковый запрос.</p>
                </div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {products.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      sortBy={sortBy}
                      selected={selected?.id === product.id}
                      onSelect={() => setSelectedId(product.id)}
                    />
                  ))}
                </div>
              )}

              {(query.data?.pageCount ?? 1) > 1 && (
                <div className="mt-4 flex items-center justify-between border-t pt-4">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
                    <ChevronLeft className="mr-1 h-4 w-4" /> Назад
                  </Button>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {page} / {query.data?.pageCount}
                  </span>
                  <Button variant="outline" size="sm" disabled={page >= (query.data?.pageCount ?? 1)} onClick={() => setPage((value) => value + 1)}>
                    Далее <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <ProductDetails product={selected} />
          </div>

          {showTransitionLoader && (
            <div className="absolute inset-0 z-20 flex items-start justify-center rounded-xl bg-background/55 pt-20 backdrop-blur-[2px] animate-in fade-in duration-200">
              <div className="flex min-w-52 flex-col items-center rounded-2xl border bg-card/95 px-7 py-6 text-center shadow-xl shadow-primary/10">
                <div className="relative mb-3 flex h-12 w-12 items-center justify-center">
                  <span className="absolute inset-0 animate-spin rounded-full border-2 border-primary/15 border-t-primary" />
                  <Database className="h-5 w-5 text-primary" />
                </div>
                <p className="text-sm font-semibold">Обновляем каталог</p>
                <p className="mt-1 text-[11px] text-muted-foreground">Подбираем продукты и показатели</p>
                <div className="mt-4 h-1 w-32 overflow-hidden rounded-full bg-primary/10">
                  <div className="h-full w-2/3 animate-pulse rounded-full bg-primary" />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CatalogInitialLoader() {
  return (
    <Card className="relative min-h-[460px] overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,hsl(var(--primary)/0.10),transparent_42%)]" />
      <CardContent className="relative flex min-h-[460px] flex-col items-center justify-center px-6 text-center">
        <div className="relative mb-5 flex h-20 w-20 items-center justify-center">
          <span className="absolute inset-0 animate-ping rounded-full border border-primary/15" />
          <span className="absolute inset-2 animate-spin rounded-full border-2 border-primary/15 border-t-primary" />
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 shadow-inner">
            <Database className="h-6 w-6 text-primary" />
          </span>
        </div>
        <p className="text-base font-semibold">Загружаем каталог питания</p>
        <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
          Получаем продукты и распределяем показатели по нутриентным группам
        </p>
        <div className="mt-6 flex items-center gap-1.5">
          {[0, 1, 2].map((index) => (
            <span
              key={index}
              className="h-1.5 w-8 animate-pulse rounded-full bg-primary/60"
              style={{ animationDelay: `${index * 160}ms` }}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ProductCard({
  product,
  sortBy,
  selected,
  onSelect,
}: {
  product: NutritionProductDto;
  sortBy: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const nutrientMap = new Map(product.nutrients.map((nutrient) => [nutrient.code, nutrient]));
  const summaryCodes = sortBy === "name"
    ? ["ME", "CP", "CFa"]
    : [sortBy, ...["ME", "CP", "CFa"].filter((code) => code !== sortBy)].slice(0, 3);
  const summary = summaryCodes.map((code) => nutrientMap.get(code)).filter(Boolean);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "rounded-xl border p-3 text-left transition-all hover:border-primary/40 hover:bg-muted/30",
        selected && "border-primary bg-primary/5 ring-1 ring-primary/20",
      )}
    >
      <span className="line-clamp-2 min-h-10 text-sm font-semibold leading-5">{product.name}</span>
      {product.subcategory && (
        <span className="mt-1 block truncate text-[10px] text-muted-foreground">{product.subcategory}</span>
      )}
      <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {summary.length > 0 ? summary.map((nutrient) => nutrient && (
          <span key={nutrient.code} className="text-[10px] text-muted-foreground">
            {nutrient.code} <b className="font-semibold text-foreground">{formatValue(nutrient.value)}</b>
          </span>
        )) : <span className="text-[10px] text-muted-foreground">Открыть показатели</span>}
      </span>
    </button>
  );
}

function ProductDetails({ product }: { product: NutritionProductDto | null }) {
  const sendProductToDryMatter = useNutritionWorkspace((s) => s.sendProductToDryMatter);
  const addProductToDiet = useNutritionWorkspace((s) => s.addProductToDiet);

  if (!product) {
    return (
      <Card className="min-h-64">
        <CardContent className="flex h-full min-h-64 items-center justify-center text-center text-sm text-muted-foreground">
          Выберите продукт, чтобы увидеть показатели.
        </CardContent>
      </Card>
    );
  }

  const nutrientMap = new Map(product.nutrients.map((nutrient) => [nutrient.code, nutrient]));
  const calculatedCount = product.nutrients.filter((nutrient) => nutrient.calculated).length;

  const nutrientValue = (code: string) => nutrientMap.get(code)?.value ?? null;
  const moisture = nutrientValue("MO")
    ?? (nutrientValue("DM") != null ? Math.max(0, 100 - (nutrientValue("DM") as number)) : null);
  const meKcalPerKg = nutrientValue("ME");
  const canAnalyzeDm = nutrientValue("CP") != null && nutrientValue("CFa") != null && moisture != null;

  function handleSendToDryMatter() {
    if (!product || !canAnalyzeDm) return;
    sendProductToDryMatter({
      productId: product.id,
      productName: product.name,
      protein: nutrientValue("CP") ?? 0,
      fat: nutrientValue("CFa") ?? 0,
      fiber: nutrientValue("CFi") ?? 0,
      moisture: moisture ?? 0,
      meKcalPerKg,
    });
  }

  function handleAddToDiet() {
    if (!product) return;
    const added = addProductToDiet(productToDietComponent(product));
    if (added) {
      toast.success(`«${product.name}» добавлен в рацион`, {
        description: "Доля и граммовка — на вкладке Diet Builder",
      });
    } else {
      toast.info("Этот продукт уже есть в рационе");
    }
  }

  return (
    <Card className="h-fit lg:sticky lg:top-4">
      <CardHeader className="pb-2">
        <div className="mb-2 flex items-center gap-2">
          <Badge variant="secondary" className="capitalize">{product.category}</Badge>
          {product.subcategory && <Badge variant="outline">{product.subcategory}</Badge>}
          <span className="text-[10px] text-muted-foreground">{product.nutrients.length} показателей</span>
        </div>
        <CardTitle className="text-lg leading-tight">{product.name}</CardTitle>
        <div className="flex items-center gap-1.5 pt-1 text-[10px] text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-primary" />
          {calculatedCount > 0 ? `Расчётные значения отмечены точкой · ${calculatedCount}` : "Все значения исходные"}
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={handleAddToDiet}>
            <Plus className="h-3.5 w-3.5" /> В рацион
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs"
            disabled={!canAnalyzeDm}
            title={canAnalyzeDm ? undefined : "Недостаточно данных (нужны CP, CFa и влажность)"}
            onClick={handleSendToDryMatter}
          >
            <FlaskConical className="h-3.5 w-3.5" /> Анализ DM
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Accordion type="multiple" defaultValue={["control", "main"]} className="w-full">
          {NUTRIENT_GROUPS.map((group) => {
            const available = group.codes.filter((code) => nutrientMap.has(code)).length;
            return (
              <AccordionItem key={group.id} value={group.id}>
                <AccordionTrigger className="py-3 text-sm hover:no-underline">
                  <span className="flex items-center gap-2">
                    {group.label}
                    <Badge variant="outline" className="h-5 px-1.5 text-[9px] font-normal">{available}/{group.codes.length}</Badge>
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="grid grid-cols-2 gap-1.5">
                    {group.codes.map((code) => {
                      const nutrient = nutrientMap.get(code);
                      return (
                        <div key={code} className={cn("rounded-lg border bg-muted/20 p-2", !nutrient && "opacity-45")}>
                          <div className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
                            {nutrient?.calculated && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                            {code}
                          </div>
                          <div className="mt-0.5 truncate text-sm font-semibold tabular-nums">
                            {nutrient ? formatValue(nutrient.value) : "—"}
                            {nutrient && NUTRIENT_UNITS[code] && (
                              <span className="ml-1 text-[9px] font-normal text-muted-foreground">{NUTRIENT_UNITS[code]}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </CardContent>
    </Card>
  );
}
