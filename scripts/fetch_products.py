"""
Fetch products from petvetdiet.org by catalog category IDs,
normalize them via file.py, then enrich with subcategory.

Auth: PETVET_COOKIE in project .env, env var, or --cookie.

Example:
  python scripts/fetch_products.py
  python scripts/fetch_products.py --only 6
  python scripts/fetch_products.py --only 3 --append
"""

from __future__ import annotations

import argparse
import json
import os
import random
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv

SCRIPTS_DIR = Path(__file__).resolve().parent
ROOT_DIR = SCRIPTS_DIR.parent

load_dotenv(ROOT_DIR / ".env")

if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from file import (  # noqa: E402
    FILE_TYPES,
    normalize_product,
    save_json,
)

BASE_URL = "https://petvetdiet.org/app/product/ajax/list"
CATALOG_PATH = SCRIPTS_DIR / "data" / "catalog.json"
DEFAULT_OUTPUT = ROOT_DIR / "products_normalized.json"
PAGE_SIZE = 50
# Polite defaults: space out requests so the remote API is not hammered.
REQUEST_DELAY_SEC = 2.0
CATEGORY_DELAY_SEC = 10.0
SUBCATEGORY_DELAY_SEC = 5.0
REQUEST_JITTER_SEC = 0.5

DEFAULT_HEADERS = {
    "Accept": "*/*",
    "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
    "Connection": "keep-alive",
    "Referer": "https://petvetdiet.org/app",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/150.0.0.0 Safari/537.36"
    ),
    "sec-ch-ua": '"Not;A=Brand";v="8", "Chromium";v="150", "Google Chrome";v="150"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "X-Requested-With": "XMLHttpRequest",
}


def load_catalog(path: Path) -> list[dict[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8"))

    if not isinstance(payload, list) or not payload:
        raise ValueError("catalog.json: ожидается непустой массив")

    root = payload[0]
    categories = root.get("data")

    if not isinstance(categories, list):
        raise ValueError('catalog.json: у root нет массива "data"')

    return categories


def category_type_name(category_id: int, catalog_name: str) -> str | None:
    mapped = FILE_TYPES.get(category_id)

    if mapped is not None:
        return mapped

    # Skip unknown categories (e.g. id=706) unless mapped in FILE_TYPES.
    return None


def build_list_url(
    category_id: int,
    *,
    start: int | None = None,
    count: int | None = None,
    continue_flag: bool = False,
    sort_name_asc: bool = False,
) -> str:
    """
    Matches observed URL shape:
      /list/<id>?
      /list/<id>?&start=...&count=...&continue=true
      /list/<id>?&start=...&count=...&continue=true&sort[name]=asc
    """
    base = f"{BASE_URL}/{category_id}?"
    parts: list[str] = []

    if start is not None:
        parts.append(f"start={start}")

    if count is not None:
        parts.append(f"count={count}")

    if continue_flag:
        parts.append("continue=true")

    if sort_name_asc:
        # Keep brackets unencoded to match site URLs.
        parts.append("sort[name]=asc")

    if not parts:
        return base

    return f"{base}&{'&'.join(parts)}"


def format_duration(seconds: float) -> str:
    if seconds < 60:
        return f"{seconds:.1f}s"

    minutes = int(seconds // 60)
    rem = seconds - minutes * 60
    return f"{minutes}m{rem:04.1f}s"


@dataclass
class RequestPacer:
    """Enforces delays between HTTP calls and tracks timings."""

    delay_sec: float = REQUEST_DELAY_SEC
    jitter_sec: float = REQUEST_JITTER_SEC
    category_delay_sec: float = CATEGORY_DELAY_SEC
    subcategory_delay_sec: float = SUBCATEGORY_DELAY_SEC
    started_at: float = field(default_factory=time.perf_counter)
    request_count: int = 0
    _last_request_at: float | None = None

    def elapsed(self) -> float:
        return time.perf_counter() - self.started_at

    def wait_before_request(self) -> float:
        """Sleep until the next request is allowed. Returns slept seconds."""
        if self._last_request_at is None or self.delay_sec <= 0:
            return 0.0

        wait_for = self.delay_sec - (
            time.perf_counter() - self._last_request_at
        )

        if self.jitter_sec > 0:
            wait_for += random.uniform(0.0, self.jitter_sec)

        if wait_for <= 0:
            return 0.0

        time.sleep(wait_for)
        return wait_for

    def pause(self, seconds: float, label: str) -> None:
        if seconds <= 0:
            return

        print(
            f"  pause {label}: {seconds:.1f}s "
            f"(elapsed {format_duration(self.elapsed())})"
        )
        time.sleep(seconds)

    def pause_between_categories(self) -> None:
        self.pause(self.category_delay_sec, "между категориями")

    def pause_between_subcategories(self) -> None:
        self.pause(self.subcategory_delay_sec, "между подкатегориями")

    def mark_request(self) -> None:
        self.request_count += 1
        self._last_request_at = time.perf_counter()


def create_session(cookie: str | None) -> requests.Session:
    session = requests.Session()
    session.headers.update(DEFAULT_HEADERS)

    if cookie:
        session.headers["Cookie"] = cookie.strip()

    return session


def request_json(
    session: requests.Session,
    url: str,
    *,
    pacer: RequestPacer,
    label: str = "request",
    timeout: float = 60.0,
) -> dict[str, Any]:
    slept = pacer.wait_before_request()
    started = time.perf_counter()
    response = session.get(url, timeout=timeout)
    elapsed_ms = (time.perf_counter() - started) * 1000
    pacer.mark_request()

    print(
        f"  http  {label}: status={response.status_code} "
        f"took={elapsed_ms:.0f}ms "
        f"waited={slept:.2f}s "
        f"#{pacer.request_count} "
        f"elapsed={format_duration(pacer.elapsed())}"
    )

    if response.status_code == 401:
        raise PermissionError(
            "API вернул 401 Unauthorized. "
            "Передайте Cookie через --cookie или PETVET_COOKIE."
        )

    if response.status_code == 429:
        retry_after = float(response.headers.get("Retry-After", "5"))
        print(f"  rate  429 Too Many Requests, sleep {retry_after:.1f}s")
        time.sleep(retry_after)
        return request_json(
            session,
            url,
            pacer=pacer,
            label=f"{label}-retry",
            timeout=timeout,
        )

    response.raise_for_status()

    payload = response.json()

    if not isinstance(payload, dict):
        raise ValueError(f"Ожидался JSON-объект, получено: {type(payload)}")

    return payload


def extract_total_count(payload: dict[str, Any]) -> int | None:
    value = payload.get("total_count")

    if value is None:
        return None

    try:
        return int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Некорректный total_count: {value!r}") from exc


def extract_data_rows(payload: dict[str, Any]) -> list[dict[str, Any]]:
    rows = payload.get("data")

    if rows is None:
        return []

    if not isinstance(rows, list):
        raise ValueError('Поле "data" должно быть массивом')

    return [row for row in rows if isinstance(row, dict)]


def fetch_category_raw(
    session: requests.Session,
    category_id: int,
    *,
    pacer: RequestPacer,
    page_size: int = PAGE_SIZE,
) -> list[dict[str, Any]]:
    """
    Protocol:
      1) GET list/<id>?  -> first chunk (~100 rows) + total_count
      2) Keep those rows, then paginate from start=len(first_chunk)
         with page_size and sort[name]=asc until total_count
    """
    category_started = time.perf_counter()
    print(f"  init  id={category_id}")
    init_payload = request_json(
        session,
        build_list_url(category_id),
        pacer=pacer,
        label=f"init/{category_id}",
    )

    collected = extract_data_rows(init_payload)
    total_count = extract_total_count(init_payload)

    if total_count is None:
        print(
            f"  warn  id={category_id}: total_count отсутствует, "
            f"берём {len(collected)} строк из init"
        )
        return dedupe_rows_by_id(collected)

    print(
        f"  total id={category_id} total_count={total_count} "
        f"init_rows={len(collected)}"
    )

    # Continue after the first chunk (usually 100), do not re-fetch 0..99.
    start = len(collected)
    page_num = 0
    remaining_pages = max(
        0,
        (total_count - start + page_size - 1) // page_size,
    )

    while start < total_count:
        page_num += 1
        url = build_list_url(
            category_id,
            start=start,
            count=page_size,
            continue_flag=True,
            sort_name_asc=True,
        )
        print(
            f"  page  id={category_id} start={start} "
            f"count={page_size} ({page_num}/{remaining_pages})"
        )
        page_payload = request_json(
            session,
            url,
            pacer=pacer,
            label=f"page/{category_id}@{start}",
        )
        rows = extract_data_rows(page_payload)

        if not rows:
            print(f"  stop  id={category_id}: пустая страница на start={start}")
            break

        collected.extend(rows)
        start += page_size

    took = time.perf_counter() - category_started
    print(
        f"  fetch id={category_id} done: rows={len(collected)} "
        f"in {format_duration(took)}"
    )
    return dedupe_rows_by_id(collected)


def dedupe_rows_by_id(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_id: dict[Any, dict[str, Any]] = {}
    without_id: list[dict[str, Any]] = []

    for row in rows:
        product_id = row.get("id")

        if product_id is None:
            without_id.append(row)
            continue

        by_id[product_id] = row

    return list(by_id.values()) + without_id


def product_key(raw: dict[str, Any]) -> str | None:
    product_id = raw.get("id")

    if product_id is not None:
        return f"id:{product_id}"

    name = str(raw.get("name") or raw.get("value") or "").strip()

    if name:
        return f"name:{name.casefold()}"

    return None


def normalize_rows(
    rows: list[dict[str, Any]],
    product_type: str,
    *,
    subcategory: str | None = None,
) -> dict[str, dict[str, Any]]:
    indexed: dict[str, dict[str, Any]] = {}

    for index, raw in enumerate(rows):
        key = product_key(raw)

        if key is None:
            print(f"    skip[{index}]: нет id/name")
            continue

        product = normalize_product(
            raw,
            product_type,
            subcategory=subcategory,
            calculate_me=True,
            overwrite_existing=False,
        )

        if not product["name"]:
            print(f"    skip[{index}]: пустое имя")
            continue

        indexed[key] = product

    return indexed


def enrich_with_subcategories(
    session: requests.Session,
    products_by_key: dict[str, dict[str, Any]],
    product_type: str,
    subcategories: list[dict[str, Any]],
    *,
    pacer: RequestPacer,
    page_size: int,
) -> None:
    active_subs = [
        sub
        for sub in subcategories
        if sub.get("id") is not None
        and str(sub.get("name") or "").strip()
    ]

    for index, sub in enumerate(active_subs):
        if index > 0:
            pacer.pause_between_subcategories()

        sub_id = int(sub["id"])
        sub_name_raw = str(sub.get("name") or "").strip()
        sub_name = sub_name_raw.lower()
        print(f"  subcat id={sub_id} name={sub_name_raw!r}")

        raw_rows = fetch_category_raw(
            session,
            sub_id,
            pacer=pacer,
            page_size=page_size,
        )
        sub_products = normalize_rows(
            raw_rows,
            product_type,
            subcategory=sub_name,
        )

        matched = 0
        added = 0

        for key, product in sub_products.items():
            existing = products_by_key.get(key)

            if existing is not None:
                existing["subcat"] = sub_name
                matched += 1
            else:
                products_by_key[key] = product
                added += 1

        print(
            f"  subcat done id={sub_id}: "
            f"matched={matched} added={added}"
        )


def fetch_all_products(
    session: requests.Session,
    categories: list[dict[str, Any]],
    *,
    pacer: RequestPacer,
    page_size: int,
    category_ids: set[int] | None = None,
) -> list[dict[str, Any]]:
    all_products: list[dict[str, Any]] = []
    selected: list[dict[str, Any]] = []

    for category in categories:
        category_id = category.get("id")
        catalog_name = str(category.get("name") or "").strip()

        if category_id is None:
            continue

        category_id_int = int(category_id)

        if category_ids is not None and category_id_int not in category_ids:
            continue

        product_type = category_type_name(category_id_int, catalog_name)

        if product_type is None:
            print(
                f"skip category id={category_id_int} "
                f"name={catalog_name!r}: нет в FILE_TYPES"
            )
            continue

        selected.append(category)

    for index, category in enumerate(selected):
        if index > 0:
            pacer.pause_between_categories()

        category_id_int = int(category["id"])
        catalog_name = str(category.get("name") or "").strip()
        product_type = category_type_name(category_id_int, catalog_name)

        if product_type is None:
            continue

        category_started = time.perf_counter()
        print(f"\n=== category id={category_id_int} type={product_type} ===")

        raw_rows = fetch_category_raw(
            session,
            category_id_int,
            pacer=pacer,
            page_size=page_size,
        )
        products_by_key = normalize_rows(raw_rows, product_type)
        print(f"  main products: {len(products_by_key)}")

        subcategories = category.get("data") or []

        if isinstance(subcategories, list) and subcategories:
            enrich_with_subcategories(
                session,
                products_by_key,
                product_type,
                subcategories,
                pacer=pacer,
                page_size=page_size,
            )

        with_subcat = sum(
            1 for item in products_by_key.values() if item.get("subcat")
        )
        took = time.perf_counter() - category_started
        print(
            f"  category done: total={len(products_by_key)} "
            f"with_subcat={with_subcat} "
            f"in {format_duration(took)}"
        )
        all_products.extend(products_by_key.values())

    return all_products


def load_products_json(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []

    payload = json.loads(path.read_text(encoding="utf-8"))

    if not isinstance(payload, list):
        raise ValueError(
            f"{path}: ожидался JSON-массив продуктов для --append"
        )

    return [item for item in payload if isinstance(item, dict)]


def product_merge_key(product: dict[str, Any]) -> str:
    name = str(product.get("name") or "").strip().casefold()
    product_type = str(product.get("type") or "").strip().casefold()
    return f"{product_type}::{name}"


def merge_products(
    existing: list[dict[str, Any]],
    incoming: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], int, int]:
    """
    Append/merge incoming into existing by (type, name).
    Incoming overwrites a matching existing row.
    Returns (merged, added_count, updated_count).
    """
    merged_by_key: dict[str, dict[str, Any]] = {}
    order: list[str] = []

    for product in existing:
        key = product_merge_key(product)

        if not key.strip(":"):
            continue

        if key not in merged_by_key:
            order.append(key)

        merged_by_key[key] = product

    added = 0
    updated = 0

    for product in incoming:
        key = product_merge_key(product)

        if not key.strip(":"):
            continue

        if key in merged_by_key:
            merged_by_key[key] = product
            updated += 1
        else:
            merged_by_key[key] = product
            order.append(key)
            added += 1

    return [merged_by_key[key] for key in order], added, updated


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Fetch petvetdiet product lists by catalog.json, "
            "normalize and attach subcategory."
        )
    )
    parser.add_argument(
        "--cookie",
        default=os.environ.get("PETVET_COOKIE"),
        help="Cookie header value (or env PETVET_COOKIE)",
    )
    parser.add_argument(
        "--catalog",
        type=Path,
        default=CATALOG_PATH,
        help="Path to catalog.json",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help="Output JSON path",
    )
    parser.add_argument(
        "--append",
        action="store_true",
        help=(
            "Append/merge into existing --output file "
            "(match by type+name; incoming overwrites)"
        ),
    )
    parser.add_argument(
        "--page-size",
        type=int,
        default=PAGE_SIZE,
        help="Pagination page size (default: 50)",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=REQUEST_DELAY_SEC,
        help=f"Base delay between HTTP requests (default: {REQUEST_DELAY_SEC})",
    )
    parser.add_argument(
        "--jitter",
        type=float,
        default=REQUEST_JITTER_SEC,
        help=(
            "Random extra delay 0..jitter after each request "
            f"(default: {REQUEST_JITTER_SEC})"
        ),
    )
    parser.add_argument(
        "--category-delay",
        type=float,
        default=CATEGORY_DELAY_SEC,
        help=(
            "Extra pause between main categories "
            f"(default: {CATEGORY_DELAY_SEC})"
        ),
    )
    parser.add_argument(
        "--subcategory-delay",
        type=float,
        default=SUBCATEGORY_DELAY_SEC,
        help=(
            "Extra pause between subcategories "
            f"(default: {SUBCATEGORY_DELAY_SEC})"
        ),
    )
    parser.add_argument(
        "--only",
        type=int,
        nargs="*",
        help="Optional main category IDs to fetch (e.g. --only 6 1)",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    if not args.cookie:
        print(
            "Предупреждение: Cookie не задан "
            "(--cookie / PETVET_COOKIE). API может вернуть 401."
        )

    pacer = RequestPacer(
        delay_sec=args.delay,
        jitter_sec=args.jitter,
        category_delay_sec=args.category_delay,
        subcategory_delay_sec=args.subcategory_delay,
    )

    print(
        "rate limits: "
        f"delay={pacer.delay_sec:.2f}s "
        f"jitter=0..{pacer.jitter_sec:.2f}s "
        f"category={pacer.category_delay_sec:.1f}s "
        f"subcategory={pacer.subcategory_delay_sec:.1f}s"
    )

    categories = load_catalog(args.catalog)
    category_ids = set(args.only) if args.only else None
    session = create_session(args.cookie)

    products = fetch_all_products(
        session,
        categories,
        pacer=pacer,
        page_size=args.page_size,
        category_ids=category_ids,
    )

    if args.append:
        existing = load_products_json(args.output)
        before = len(existing)
        products, added, updated = merge_products(existing, products)
        print(
            f"\nappend: было={before}, "
            f"добавлено={added}, обновлено={updated}, "
            f"итого={len(products)}"
        )

    save_json(products, args.output)
    print(
        f"\nСохранено: {args.output} ({len(products)} продуктов) "
        f"за {format_duration(pacer.elapsed())}, "
        f"запросов: {pacer.request_count}"
    )


if __name__ == "__main__":
    main()