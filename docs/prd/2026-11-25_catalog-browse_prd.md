---
prd_id: 2026-11-25-catalog-browse
cycle_id: 2026-11-25-catalog-browse
cycle_slug: catalog-browse
title: Catalog Browse
created: 2026-11-25
filename: docs/prd/2026-11-25_catalog-browse_prd.md
project_doc: docs/PROJECT.md
status: draft
scope_type: cycle
source: product-discovery
related_issue_batch: null
---

# PRD: Catalog Browse

## Cycle Summary

Roadmap **#11**, stage **Pro**, status **⬜ Planned** while this PRD is a draft. Predecessor is closed cycle #10 Booking by Problem. Specialty Depth stays next and is now #12.

This cycle changes how a nutritionist browses foods on **Расчёт рациона**, and how an incomplete ration total is labeled. The catalog tab gains a category tree. Adding a food to a ration opens that same nutrient table in a modal. An Итого cell that now shows `?—` shows `≥` and the known amount. Normative status, diet-plan snapshots, and the rest of the clinic workspace stay as they are.

## Goal

The nutritionist can narrow the Food catalog by category and subcategory without a horizontal chip bar, see how many products sit in each branch, and add a ration food from the same nutrient table, including rows past the first page. When a ration nutrient is only partly known, the Итого cell shows the known lower bound instead of `?—`.

## Current Project Context

Shipped nutrition workspace (`/nutrition`, title **Расчёт рациона**) has three tabs: **Рацион**, **Недавние планы**, **Каталог**.

The catalog tab shows a horizontal category panel. Each category opens a popover with tri-state selection of its subcategories. Search, nutrient-group tabs, server sorting, a 50-row matrix, and a footer **Загрузить ещё** are already there. The table stays empty until a category or a name search is set. Active filter chips and **Очистить всё** already sit above the table. Creating and editing a food stays on this tab. Category data comes from PostgreSQL `foods.category` / `foods.subcategory`. The category API returns names only, without product counts. Several source rows for one food, nutrient, and basis still resolve to the newest value. Saved diet-plan snapshots stay frozen.

The ration nutrient table has an **Итого** row labeled **Рацион**. For an unevaluable nutrient the cell prefix is `?`. When the comparable amount is empty, the number is `—`, so the cell reads `?—`. That happens when product data is missing and the official total is withheld. Known per-food contributions can still exist; a missing food amount stays unknown and is not stored as zero. A complete total shows the number without that prefix. The separate kcal summary above the table is a different line.

**Добавить продукт** on the ration tab is a right-edge sheet about 680 px wide. It offers name search, type chips (all, ingredients, commercial foods, supplements, treats), one category dropdown, and one subcategory dropdown. Results are a capped card list, not the nutrient matrix, and there is no next page. The sheet stays open so the clinician can add several foods; a food already on the ration cannot be added again.

## New Functionality

### Catalog category sidebar

On the catalog tab, replace the horizontal category panel with a collapsible sidebar.

- Width 256 px, inside the accepted 240–260 px range.
- The tree uses the categories and subcategories already stored on foods, including **Без категории** and **Без подкатегории**.
- Each node is a tri-state checkbox: selected, partial, or clear.
- Choosing a parent selects all of its subcategories. Choosing a fully selected parent clears that branch. Choosing a partial parent selects the remaining children.
- A category with no subcategories is a normal checkbox.
- Several branches can be expanded at once. Expanding or collapsing a branch does not change selection. All branches start collapsed.
- The sidebar scrolls vertically on its own. Rows stay compact, nesting is visible, and selected rows are visually distinct.
- On a wide layout the tree starts open. A control in the sidebar header hides the column and gives the table the freed width. That collapsed state lasts while the nutrition page stays open.
- Below the wide layout, a **Категории** button opens the tree over the table.
- Each node shows how many foods belong to that category or subcategory in the whole catalog. The name-search box does not change those counts.
- There is no separate search field inside the tree. Product search stays above the table.
- Filtering applies immediately. A food matches when its category and subcategory pair is any selected pair (OR).
- Above the table, show the active filters and **Сбросить**. **Сбросить** clears category selection and the search text. One chip still removes one filter.
- The existing **Найдено** count stays and reflects the current filter.
- Category selection and search survive switching nutrient groups and stay while the clinician remains on **Питание**. Leaving that page or reloading the browser starts from an empty filter.
- While nothing is selected and the search box is empty, the table stays empty and still invites the clinician to pick a category or search.

### Ration add catalog modal

Replace the right-edge add sheet with a large centered modal, about 90% of the viewport width.

- The modal uses the same browse as the catalog tab after this cycle: search, category tree, nutrient-group tabs, nutrient matrix, sorting, and the same empty-until-filter rule.
- The footer matches the catalog table: **Загружено N из M** and **Загрузить ещё**, in pages of 50. When every matching row is loaded, the button reports that nothing further remains.
- The row action adds the food to the current ration. Creating or editing a food is not available in this modal.
- Type chips are not part of this dialog. Browse is by category, as on the catalog tab.
- The modal stays open after an add. A food already on the ration is marked and cannot be added again. Closing is the close control or the backdrop.
- The modal keeps its own search, category selection, and nutrient group while it is open, including across nutrient-group switches. Closing the modal clears that filter state. It does not read or write the catalog tab's filters.
- The same wide-layout sidebar and narrow-layout **Категории** overlay apply inside the modal.

### Incomplete ration total

In the ration nutrient table, replace `?—` in the **Итого** / **Рацион** cell with a lower bound.

- The cell text is `≥` plus the known amount. This is the form the user wrote as `>= <value>`. The goal row already uses `≥` for a minimum, and this cell uses that same prefix.
- The known amount is the sum of per-food contributions that have a value, in the unit that cell already uses for a complete total. Foods without a value are omitted. They are not added as zero.
- When every contribution is missing, the known amount is 0 and the cell shows `≥ 0`.
- The `?` prefix is not shown in that cell.
- A complete total stays a plain number.
- Food rows are unchanged: a missing food cell stays `—`.
- The assessment status, the row color, and whether the norm is met stay on the current rules. Crossing a maximum on the known part can still raise the existing “above maximum” result. This label does not create a new status.
- The kcal summary above the table is unchanged.
- A ratio that cannot be expressed as a sum of known parts does not gain a `≥` label. Its current unevaluable presentation stays.

## Changed Existing Functionality

### Catalog filter chrome

The horizontal category panel and its per-category popovers leave the catalog tab. Search, the nutrient matrix, nutrient-group tabs, column sorting, the 50-row page, the load-more footer, food create, and food edit stay on that tab. **Очистить всё** is replaced by **Сбросить** with the clear behavior in **Catalog category sidebar**.

### Ration add entry

**Добавить продукт** opens the modal in **Ration add catalog modal** instead of the right-edge sheet. Sequential add and the block on a duplicate food stay. The sheet's type chips and single category/subcategory dropdowns go away.

### Ration total label

The **Итого** cell described in **Incomplete ration total** no longer shows `?—`. Status colors and the nutrient detail dialog stay. Food-row blanks stay blanks.

## Product Architecture Impact

Clinic web only, on the existing nutrition workspace. The owner cabinet, schedule, patients, encounters, and settings are outside this cycle.

The category read model gains a product count on each category and subcategory. Those counts describe the stored catalog, not the current search. The add modal reads the same paged nutrient matrix the catalog tab already uses. Food writes, energy formulas, nutrient-profile resolution, and diet-plan snapshots are unchanged. The assessment still decides met, below minimum, above maximum, and missing data. The Итого label for a missing additive total becomes the known lower bound.

UI uses the current clinic design system and the current nutrition feature boundary.

## Functional Nuances

- Parent selection and child selection stay consistent in both directions: a full child set shows the parent as selected, a partial child set shows the parent as partial.
- Reveal state and selection state are independent.
- OR matching is across selected category/subcategory pairs. Search text still narrows that set when both are present.
- Node counts ignore the search box and ignore the other screen's filters.
- Catalog-tab filters and modal filters do not sync.
- A viewer who can already open the nutrition workspace keeps the same ability to add foods to an unsaved ration. This cycle does not add a food-edit permission.
- A missing food cell stays `—`. A known zero stays zero. The Итого lower bound omits missing foods instead of treating them as zero. Matrix basis stays per 100 g as fed.
- Load-more failure stays visible, and the clinician can retry the next page.
- Russian UI copy. **Сбросить**, **Категории**, **Загрузить ещё**, **Найдено**, and **Загружено N из M** are the labels for this cycle.

## Data, Integrations, and Constraints

- Source of categories remains `foods.category` and `foods.subcategory` in PostgreSQL. No new browse taxonomy.
- The category listing must return a product count per node. Count is the number of foods in that node, not a count of nutrient rows.
- The add modal must page through the existing matrix query. The capped summary search used by the current sheet does not satisfy **Загрузить ещё**.
- No change to FEDIAF provider selection, `input_hash` staleness, snapshot freeze, or the status enum. The known amount for `≥` is the sum of contributions that already have a daily amount.
- No new third-party service.

## Out of Scope for This Cycle

- Energy adjustment, FEDIAF comparison rules, diet-plan save/replace, and the status of a nutrient row. Only the incomplete **Итого** label changes.
- Moving food create or food edit into the add modal.
- Food `species_compatibility` and type-based browse chips.
- A search box inside the category tree.
- Remembering filters after leaving **Питание** or after a browser reload.
- Specialty Depth (#12): encounter templates, signed encounters, dose and fluids calculators, therapeutic nutrient profiles.
- Owner cabinet, schedule, patients, and settings.

## Open Questions

None. The browse rules above are the accepted cycle scope.
