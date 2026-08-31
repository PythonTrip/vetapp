from decimal import Decimal
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

import pytest


def _load_product_normalize():
    path = Path(__file__).resolve().parents[4] / "scripts" / "file.py"
    spec = spec_from_file_location("product_normalize", path)
    assert spec is not None
    assert spec.loader is not None
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope="module")
def product_normalize():
    return _load_product_normalize()


def test_script_modified_atwater_is_kcal_per_100g(product_normalize) -> None:
    me = product_normalize.calculate_me_modified_atwater(
        Decimal("25"),
        Decimal("15"),
        Decimal("40"),
    )
    assert me == Decimal("355.0")


def test_script_cp_per_1000_kcal_uses_kcal_per_100g(product_normalize) -> None:
    density = product_normalize.calculate_cp_per_1000_kcal(
        Decimal("25"),
        Decimal("355"),
    )
    assert density == Decimal("25") * Decimal("1000") / Decimal("355")
