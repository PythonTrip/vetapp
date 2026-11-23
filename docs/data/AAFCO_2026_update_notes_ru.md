# AAFCO — обзор изменений на 23 ноября 2026 года

## Что это за версия
Файл `AAFCO_2026_updated_ru.json` сохраняет все четыре профиля, унаследованные из `AAFCO_2016_ru.json`, и добавляет проверенные по открытым источникам новые правила. **Это не официальное полное воспроизведение AAFCO OP 2026**, доступ к актуальной публикации ограничен подпиской. Утверждение самого факта поправок 2026 подтверждено AAFCO, но обновлённые числа по кошкам опубликованы в отраслевом техническом обзоре, ссылающемся на AAFCO 2026.

## Новые/исправленные параметры

| Профиль | Изменение | Число | Проверка |
|---|---|---:|---|
| Кошка, adult | Общий фосфор, верхний предел | ≤5 г/1000 ккал ME | Вторичный опубликованный обзор AAFCO OP 2026 |
| Кошка, growth/reproduction | Общий фосфор, верхний предел | ≤5 г/1000 ккал ME | **Нужна прямая проверка применимости к росту/репродукции** |
| Обе кошачьи стадии | P из высокорастворимых минеральных источников | **<1 г/1000 ккал ME** | Примечание AAFCO 2026 IDC + обзор |
| Обе кошачьи стадии | Нижнее Ca:P | ≥1:1 | Технический обзор, ссылающийся на OP 2026 |
| Обе собачьи стадии | Верхнее ω-6:ω-3 | ≤30:1 | Уже было в первичной таблице 2016, но отсутствовало в загруженном JSON |
| Собака, крупные щенки | Условный максимум Ca | 4,5 г/1000 ккал ME | Перенесено в машиночитаемый вид из сноски 2016 |

Значения всех прочих питательных веществ сохранены из исходного AAFCO 2016.

## Клинические ограничения и проверка калькулятора

- Для `P_HIGH_SOLUBLE` следует рассчитывать **массу элементарного фосфора**, а не массу фосфатной соли. Число 1.00 г/1000 ккал **не проходит** строгий предел `<1`.
- `P_HIGH_SOLUBLE` — компонент `P`; **не суммируй его с P повторно**.
- `CA_P`: дели общую массу Ca на общую массу P в одинаковых единицах; `null` для максимума означает отсутствие подтверждённого верхнего предела, а не неограниченную безопасность.
- `O6_O3_RATIO`: (LA+ARA)/(ALA+EPA+DHA). Для старой категории ND отсутствие минимума не означает нулевую концентрацию.
- Для собак с ожидаемой взрослой массой ≥70 фунтов (31,75 кг), если профиль претендует на полноценность для роста крупных пород, максимум кальция 4,5, а не 6,25 г/1000 ккал ME.
- Рост, беременность и лактация не имеют отдельных новых полноценных AAFCO профилей; это один объединённый профиль growth & reproduction. Старшего возраста (senior) также нет.
- Кошачьи значения 2026 пока не подходят для автоматической выдачи юридического заключения о соответствии: см. `verification_status`, `stage_scope_crosscheck_required` и ограничения штатов.
- Сверка с заявленной энергетической плотностью и лабораторными данными критична; подтверждение полноценности кормом возможно по профилю или отдельным протоколам кормления AAFCO.

## Источники

- Базовые таблицы AAFCO 2016: https://www.aafco.org/wp-content/uploads/2023/01/MBRC_minutes_Attachment_A.pdf
- Первичная новость AAFCO (13.10.2026): https://aafco.org/news/ca-p-enforcement-update/
- Рекомендация AAFCO о переходном периоде: https://www.aafco.org/wp-content/uploads/2026/10/EIC-AAFCO_Enforcement_Discretion_Postion_Related_to_Feline_Ca-P_Changes.pdf
- AAFCO IDC, январь 2026, примечание к высокорастворимым фосфатам: https://www.aafco.org/wp-content/uploads/2026/03/2026_Midyear_Minutes-IDC.pdf
- Simmons Pet Food, 2026 (вторичный источник чисел Ca/P, ссылается на OP): https://simmonspetfood.com/whitepapers/9/29/2026/phosphorus-in-feline-nutrition-what-aafcos-new-phosphorus-recommendations-mean-for-cat-food-formulation
- AAFCO PFC, август 2026 (senior-профиль не утверждён): https://www.aafco.org/wp-content/uploads/2026/10/Attachment_11_Annual_Meeting_Minutes_-_PFC.pdf
- AAFCO (нет официального нового верхнего предела Cu для собак): https://aafco.org/news/pfc-votes-on-voluntary-controlled-copper-claim-for-dog-food

## Перечень изменений JSON

- dog_adult_maintenance: added missing O6_O3_RATIO max 30:1 from 2016 source
- dog adult CA: removed misleading applicability of large-breed puppy max
- dog_growth_reproduction: added missing O6_O3_RATIO max 30:1 from 2016 source
- dog_growth_reproduction:ALA clarified numeric minimum vs ND footnote
- dog_growth_reproduction:EPA_DHA clarified numeric minimum vs ND footnote
- dog growth CA: machine-readable large-breed conditional max
- cat growth ALA: corrected erroneous ND text
- cat growth EPA_DHA: corrected erroneous ND text
- cat_adult_maintenance: P max 5.0 g/1000 kcal ME (2026 reported, primary edition pending verification)
- cat_adult_maintenance: new Ca:P min 1:1 (2026 reported)
- cat_adult_maintenance: new P_HIGH_SOLUBLE max exclusive 1.0 g/1000 kcal ME (2026)
- cat_growth_reproduction: P max 5.0 g/1000 kcal ME (2026 reported, primary edition pending verification)
- cat_growth_reproduction: new Ca:P min 1:1 (2026 reported)
- cat_growth_reproduction: new P_HIGH_SOLUBLE max exclusive 1.0 g/1000 kcal ME (2026)

## Что осталось непроверенным
1. Перепроверить буквальную формулировку и жизненные стадии максимального фосфора 5 г/1000 ккал по лицензионной AAFCO Official Publication 2026.
2. Проверить местное принятие поправок и точный срок правоприменения в штате реализации.
3. Для формальной аккредитации провести независимый построчный аудит всех 180 записей, включая сноски и перечень ингредиентов.

Исходный JSON не изменён. Контрольный SHA-256 исходника: `04151b22cfece2f4c3c86c7efb2a4493e1d641aec425e5a584dd1224a84f9a33`.
