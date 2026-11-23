# Nutrition standard providers

`NutritionStandardProvider` is the API boundary between FastAPI and a published
nutrition standard. `StandardRegistry` selects a provider by `(standard_code,
edition)` and exposes one explicitly active edition per standard.

The assessment service resolves the nutrient provider and evaluates the patient
energy scenario independently. It passes shared as-fed totals, known product
contributions, ration ME, and the energy requirement to `assess_prepared`.
The provider applies its own target bases, applicability rules and interpretation.
For example, a FEDIAF density target and the derived daily target each have a
separate comparison. The registry can expose editions that are unavailable for
assessment. Requests naming those editions fail with `standard_unavailable`.

Keep edition identities stable. Version corrected implementations and freeze
the provider checksum with each result. Register a new published edition as a
sibling package, for example `fediaf/v2026/`. NRC and AAFCO use that layout.
`load_provider` reads `normative_data.json` and compares ration density per
1000 kcal. Without the file the edition stays on the standards list and
assessment returns `standard_unavailable`.

## API and compatibility

- `GET /assessments/standards` lists editions, availability, source and dataset status.
- `POST /assessments/suggestions` evaluates a patient for the requested edition.
  It returns a recommendation and compatibility for each selectable profile.
- In `POST /assessments`, use `profile_mode: "manual"` for energy and composition
  preview without a profile. Submit `profile_selection` after explicit
  confirmation. An incompatible selection yields HTTP 422. A higher-risk
  mismatch requires a clinician comment.
- Legacy requests that omit both fields retain FEDIAF automatic selection.
  All selections supplied through the new field are validated regardless of mode.
- The workbench sends `expected_input_hash` when saving. The server compares
  it against the recalculated result using the current catalogue and returns
  HTTP 409 if inputs changed.

PostgreSQL remains responsible for patient/clinical data, foods, diet plans,
and stored assessment snapshots. A snapshot freezes provider identity,
checksum, resolved context, and result so reading an old plan never invokes the
current provider. New confirmations include the authenticated ID and the time
the confirmation was recorded with the snapshot.

## Source audit

| Edition | Dataset status |
| --- | --- |
| FEDIAF 2025.09 | The existing minimum recommendations remain available. The bundled dataset has no upper-limit columns. [Guidelines](https://europeanpetfood.org/self-regulation/nutritional-guidelines/) |
| NRC 2006 | Package `nrc/v2006`. The API edition stays `2006`; `dataset_revision` is `2006-expanded-2026-11-23-r1`. Five profiles are selectable: dog adult maintenance, puppy growth at 4–14 weeks, puppy growth after 14 weeks, cat adult maintenance, and post-weaning cat growth. Three partial reproduction profiles stay hidden. On an RA row, `minimum` is the recommended allowance. A stored MR is reference data and is not the compared limit. SUL values are absent, so a null maximum is not evidence of safety. Vitamin A is µg RE and vitamin D is µg; neither is compared with catalog IU. The cat taurine RA of 0.10 g/1000 kcal is not applied, because the NRC footnote is for purified diets and the dry and canned values are g/kg diet. An intake below RA alone cannot establish clinical deficiency. [Book](https://www.nationalacademies.org/publications/10668) |
| AAFCO 2016 | Package `aafco/v2026`. `database_meta.version` stays `2016`, and that is the edition code on the API. `dataset_revision` is `2026-11-23-review`. The file keeps the four 2016 calorie-basis profiles and adds the dog ω-6:ω-3 maximum of 30:1, a machine-readable large-breed puppy calcium cap of 4.5 g/1000 kcal at an expected adult weight of at least 31.75 kg, a feline total-phosphorus maximum of 5 g/1000 kcal, a feline Ca:P minimum of 1:1, and an exclusive highly soluble phosphorus cap below 1 g/1000 kcal. Soluble phosphorus is not added to total phosphorus and cannot be calculated from catalog phosphorus. The 2026 feline numbers come from a secondary technical review pending the Official Publication. [Source PDF](https://www.aafco.org/wp-content/uploads/2023/01/MBRC_minutes_Attachment_A.pdf) |

FEDIAF Table VII-6 gives the dog age cohorts in whole years. The application uses
completed years for the boundaries: 12–<36 months, 36–<96 months, and 96 months
onward, when age drives the estimate. A 26-month-old, 5 kg dog with unspecified
activity uses the young-adult coefficient and gives 434.68 kcal/day before any
adjustment. The previous fallback gave 367.81 kcal/day. The normative MER
profile remains independently selectable. Table VII-8b distinguishes the first
four and later five weeks of canine gestation. Table VII-10 uses litter size to
select the feline lactation equation and week to select its multiplier.

Product ME uses the recorded as-fed value when valid, otherwise the applicable
method from §7.2.2.2 of the same publication. Missing inputs leave total ME
unknown. Known energy contributions remain available. New tables of nutritional
maxima and EU legal limits would require different handling: the former are
nutritional concentration limits, and the latter depend on dry matter and
additive use. [FEDIAF September 2025 PDF](https://europeanpetfood.org/wp-content/uploads/2025/09/FEDIAF-Nutritional-Guidelines_2025-ONLINE.pdf)

Alembic revision `0019_archive_guideline_runtime_tables` keeps only
`guideline_standards` and `guideline_editions` in `public`. Pre-provider
normative tables are moved intact to `legacy_guidelines` for lossless rollback;
the application metadata and runtime do not map that archive schema.
