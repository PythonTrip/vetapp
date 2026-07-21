import json
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path
from typing import Any


PRODUCT_FIELDS = {
    "id",
    "name",
    "value",
    "$css",
    "enabled",
    "category",
    "qty",
    "group_id",
    "pv",
}


PARAMS = [
    # Контрольные
    "ME/DM",
    "CP/ME",
    "CP/DM",
    "CH/DM",
    "CFa/DM",
    "CFi/DM",
    "CAs/DM",
    "Ca/P",
    "Zn/Ca",
    "ω6/ω3",

    # Основные
    "ME",
    "CP",
    "CFa",
    "CFi",
    "CAs",
    "CH",
    "MO",
    "DM",

    # Минералы
    "Ca",
    "P",
    "Mg",
    "Na",
    "K",
    "Cl",
    "Fe",
    "Cu",
    "Zn",
    "Mn",
    "Se",
    "J",

    # Витамины
    "A",
    "D",
    "E",
    "B1",
    "B2",
    "B3",
    "B4",
    "B5",
    "B6",
    "B7",
    "B9",
    "B12",
    "C",

    # Аминокислоты
    "His",
    "Phe",
    "Tau",
    "Thr",
    "Trp",
    "Tyr",
    "Val",
    "Met",
    "Ile",
    "Lys",
    "Arg",
    "Leu",
    "Cys",

    # Жирные кислоты
    "LA",
    "ALA",
    "AA",
    "EPA",
    "DHA",
]


PARAM_SET = set(PARAMS)

FILE_TYPES = {
    1: "углеводы",
    2: "жиры",
    3: "клетчатка",
    4: "сухие корма",
    5: "влажные корма",
    6: "белки",
    7: "добавки",
    8: "лакомства",
}


CODE_TO_PARAM = {
    "me_in_dm": "ME/DM",
    "cp_in_me": "CP/ME",
    "cp_in_dm": "CP/DM",
    "ch_in_dm": "CH/DM",
    "cfa_in_dm": "CFa/DM",
    "cfi_in_dm": "CFi/DM",
    "cas_in_dm": "CAs/DM",
    "ca_p_ratio": "Ca/P",
    "zn_ca": "Zn/Ca",
    "o6_o3": "ω6/ω3",
}


CALCULATED_DECIMALS = {
    "ME": 0,
    "ME/DM": 0,
    "CP/ME": 0,
    "CP/DM": 0,
    "CH/DM": 0,
    "CFa/DM": 0,
    "CFi/DM": 0,
    "CAs/DM": 0,
    "Ca/P": 1,
    "Zn/Ca": 2,
    "ω6/ω3": 1,
    "CH": 0,
    "DM": 0,
}


def to_decimal(value: Any) -> Decimal | None:
    if value is None or isinstance(value, bool):
        return None

    if isinstance(value, str):
        value = value.strip().replace(",", ".")

        if not value:
            return None

    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return None


def round_decimal(value: Decimal, decimals: int) -> Decimal:
    quantizer = Decimal("1").scaleb(-decimals)

    return value.quantize(
        quantizer,
        rounding=ROUND_HALF_UP,
    )


def json_number(
    value: Decimal,
    decimals: int | None = None,
) -> int | float:
    if decimals is not None:
        value = round_decimal(value, decimals)

    if value == value.to_integral_value():
        return int(value)

    return float(value)


def safe_divide(
    numerator: Decimal | None,
    denominator: Decimal | None,
) -> Decimal | None:
    if numerator is None or denominator is None:
        return None

    if denominator == 0:
        return None

    return numerator / denominator


def calculate_dry_matter(
    moisture: Decimal | None,
) -> Decimal | None:
    if moisture is None:
        return None

    result = Decimal("100") - moisture

    if result <= 0 or result > 100:
        return None

    return result


def calculate_carbohydrates(
    protein: Decimal | None,
    fat: Decimal | None,
    fiber: Decimal | None,
    ash: Decimal | None,
    moisture: Decimal | None,
) -> Decimal | None:
    values = [protein, fat, fiber, ash, moisture]

    if any(value is None for value in values):
        return None

    result = Decimal("100") - sum(values, Decimal("0"))

    if result < Decimal("-0.5"):
        return None

    return max(result, Decimal("0"))


def calculate_dry_matter_value(
    nutrient: Decimal | None,
    dry_matter: Decimal | None,
) -> Decimal | None:
    ratio = safe_divide(nutrient, dry_matter)

    if ratio is None:
        return None

    return ratio * Decimal("100")


def calculate_me_modified_atwater(
    protein: Decimal | None,
    fat: Decimal | None,
    carbohydrates: Decimal | None,
) -> Decimal | None:
    if protein is None or fat is None or carbohydrates is None:
        return None

    return (
        protein * Decimal("3.5")
        + fat * Decimal("8.5")
        + carbohydrates * Decimal("3.5")
    ) * Decimal("10")


def calculate_cp_per_1000_kcal(
    protein_percent: Decimal | None,
    me_kcal_per_kg: Decimal | None,
) -> Decimal | None:
    if protein_percent is None or me_kcal_per_kg is None:
        return None

    if me_kcal_per_kg <= 0:
        return None

    protein_grams_per_kg = protein_percent * Decimal("10")
    thousands_kcal_per_kg = me_kcal_per_kg / Decimal("1000")

    return protein_grams_per_kg / thousands_kcal_per_kg


def calculate_ratio(
    numerator: Decimal | None,
    denominator: Decimal | None,
) -> Decimal | None:
    return safe_divide(numerator, denominator)


def calculate_omega_ratio(
    params: dict[str, Decimal],
) -> Decimal | None:
    omega_6_values = [
        params.get("LA"),
        params.get("AA"),
    ]

    omega_3_values = [
        params.get("ALA"),
        params.get("EPA"),
        params.get("DHA"),
    ]

    known_omega_6 = [
        value
        for value in omega_6_values
        if value is not None
    ]

    known_omega_3 = [
        value
        for value in omega_3_values
        if value is not None
    ]

    if not known_omega_6 or not known_omega_3:
        return None

    omega_6 = sum(known_omega_6, Decimal("0"))
    omega_3 = sum(known_omega_3, Decimal("0"))

    return safe_divide(omega_6, omega_3)


def is_nutrient_object(value: Any) -> bool:
    return (
        isinstance(value, dict)
        and "qty" in value
        and ("id" in value or "c" in value)
    )


def resolve_param_name(
    source_key: str,
    nutrient: dict[str, Any],
) -> str | None:
    if source_key in PARAM_SET:
        return source_key

    code = nutrient.get("c")

    if not isinstance(code, str):
        return None

    normalized_code = CODE_TO_PARAM.get(code, code)

    if normalized_code in PARAM_SET:
        return normalized_code

    return None


def extract_source_params(
    raw_product: dict[str, Any],
) -> tuple[dict[str, Decimal], dict[str, str]]:
    """
    Возвращает:
    - значения параметров;
    - источник каждого параметра.
    """
    params: dict[str, Decimal] = {}
    sources: dict[str, str] = {}

    for source_key, raw_value in raw_product.items():
        if source_key in PRODUCT_FIELDS:
            continue

        if not is_nutrient_object(raw_value):
            continue

        param_name = resolve_param_name(
            source_key,
            raw_value,
        )

        if param_name is None:
            continue

        value = to_decimal(raw_value.get("qty"))

        if value is None:
            continue

        params[param_name] = value
        sources[param_name] = "api"

    return params, sources


def set_calculated(
    params: dict[str, Decimal],
    sources: dict[str, str],
    key: str,
    value: Decimal | None,
    overwrite: bool,
) -> None:
    """
    Добавляет вычисленное значение и указывает его источник.

    При overwrite=False значение API не перезаписывается.
    """
    if value is None:
        return

    if overwrite or key not in params:
        params[key] = value
        sources[key] = "calculated"


def calculate_control_params(
    source_params: dict[str, Decimal],
    source_map: dict[str, str],
    *,
    calculate_me: bool = True,
    overwrite_existing: bool = False,
) -> tuple[dict[str, Decimal], dict[str, str]]:
    params = dict(source_params)
    sources = dict(source_map)

    calculated_dm = calculate_dry_matter(
        params.get("MO")
    )

    set_calculated(
        params,
        sources,
        "DM",
        calculated_dm,
        overwrite_existing,
    )

    calculated_ch = calculate_carbohydrates(
        protein=params.get("CP"),
        fat=params.get("CFa"),
        fiber=params.get("CFi"),
        ash=params.get("CAs"),
        moisture=params.get("MO"),
    )

    set_calculated(
        params,
        sources,
        "CH",
        calculated_ch,
        overwrite_existing,
    )

    dry_matter = params.get("DM")

    dry_matter_fields = {
        "CP/DM": "CP",
        "CH/DM": "CH",
        "CFa/DM": "CFa",
        "CFi/DM": "CFi",
        "CAs/DM": "CAs",
    }

    for result_key, source_key in dry_matter_fields.items():
        result = calculate_dry_matter_value(
            params.get(source_key),
            dry_matter,
        )

        set_calculated(
            params,
            sources,
            result_key,
            result,
            overwrite_existing,
        )

    if calculate_me:
        calculated_me = calculate_me_modified_atwater(
            protein=params.get("CP"),
            fat=params.get("CFa"),
            carbohydrates=params.get("CH"),
        )

        set_calculated(
            params,
            sources,
            "ME",
            calculated_me,
            overwrite_existing,
        )

    me_dm = calculate_dry_matter_value(
        params.get("ME"),
        dry_matter,
    )

    set_calculated(
        params,
        sources,
        "ME/DM",
        me_dm,
        overwrite_existing,
    )

    cp_me = calculate_cp_per_1000_kcal(
        protein_percent=params.get("CP"),
        me_kcal_per_kg=params.get("ME"),
    )

    set_calculated(
        params,
        sources,
        "CP/ME",
        cp_me,
        overwrite_existing,
    )

    set_calculated(
        params,
        sources,
        "Ca/P",
        calculate_ratio(
            params.get("Ca"),
            params.get("P"),
        ),
        overwrite_existing,
    )

    set_calculated(
        params,
        sources,
        "Zn/Ca",
        calculate_ratio(
            params.get("Zn"),
            params.get("Ca"),
        ),
        overwrite_existing,
    )

    set_calculated(
        params,
        sources,
        "ω6/ω3",
        calculate_omega_ratio(params),
        overwrite_existing,
    )

    return params, sources


def build_sql_params(
    calculated_params: dict[str, Decimal],
) -> dict[str, int | float | None]:
    """Полный список PARAMS: значение или null."""
    sql_params: dict[str, int | float | None] = {}

    for key in PARAMS:
        value = calculated_params.get(key)

        if value is None:
            sql_params[key] = None
            continue

        decimals = CALCULATED_DECIMALS.get(key)
        sql_params[key] = json_number(
            value,
            decimals=decimals,
        )

    return sql_params


def build_calculated_list(
    sources: dict[str, str],
) -> list[str]:
    """Ключи PARAMS, значения которых посчитаны скриптом."""
    return [
        key
        for key in PARAMS
        if sources.get(key) == "calculated"
    ]


def normalize_product(
    raw_product: dict[str, Any],
    product_type: str,
    *,
    subcategory: str | None = None,
    calculate_me: bool = True,
    overwrite_existing: bool = False,
) -> dict[str, Any]:
    source_params, source_map = extract_source_params(
        raw_product
    )

    calculated_params, sources = calculate_control_params(
        source_params,
        source_map,
        calculate_me=calculate_me,
        overwrite_existing=overwrite_existing,
    )

    name = str(
        raw_product.get("name")
        or raw_product.get("value")
        or ""
    ).strip()

    return {
        "name": name,
        "type": product_type,
        "subcat": subcategory,
        "calculated": build_calculated_list(sources),
        **build_sql_params(calculated_params),
    }


def normalize_api_response(
    payload: dict[str, Any],
    product_type: str,
    *,
    subcategory: str | None = None,
    calculate_me: bool = True,
    overwrite_existing: bool = False,
) -> list[dict[str, Any]]:
    raw_products = payload.get("data")

    if not isinstance(raw_products, list):
        raise ValueError(
            'Ответ API не содержит массив "data"'
        )

    products = []

    for index, raw_product in enumerate(raw_products):
        if not isinstance(raw_product, dict):
            print(
                f"data[{index}] пропущен: "
                "элемент не является объектом"
            )
            continue

        product = normalize_product(
            raw_product,
            product_type,
            subcategory=subcategory,
            calculate_me=calculate_me,
            overwrite_existing=overwrite_existing,
        )

        if not product["name"]:
            print(
                f"data[{index}] пропущен: "
                "нет названия продукта"
            )
            continue

        products.append(product)

    return products


def load_json(path: str | Path) -> dict[str, Any]:
    with Path(path).open("r", encoding="utf-8") as file:
        payload = json.load(file)

    if not isinstance(payload, dict):
        raise ValueError(
            "Корневой JSON должен быть объектом"
        )

    return payload


def save_json(
    data: list[dict[str, Any]],
    path: str | Path,
) -> None:
    with Path(path).open("w", encoding="utf-8") as file:
        json.dump(
            data,
            file,
            ensure_ascii=False,
            indent=2,
        )


def main() -> None:
    full_products = []

    for file_index in range(1, 9):
        product_type = FILE_TYPES[file_index]
        payload = load_json(f"{file_index}.json")

        products = normalize_api_response(
            payload,
            product_type,
            calculate_me=True,

            # False:
            # если API уже прислал параметр, сохраняем значение API.
            #
            # True:
            # вычисляемые параметры пересчитываются скриптом.
            overwrite_existing=False,
        )
        full_products.extend(products)

    save_json(
        full_products,
        "products_normalized.json",
    )

    print(f"Обработано продуктов: {len(full_products)}")


if __name__ == "__main__":
    main()