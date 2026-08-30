"""Create and seed the Food catalog.

Revision ID: 0003_food_catalog
Revises: 0002_clients_patients
Create Date: 2026-08-28
"""

from datetime import datetime, timezone
from typing import Sequence, Union
from uuid import UUID, uuid1

import sqlalchemy as sa
from alembic import op

revision: str = "0003_food_catalog"
down_revision: Union[str, Sequence[str], None] = "0002_clients_patients"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _uuid6() -> UUID:
    value = uuid1()
    timestamp = value.time
    time_high = (timestamp >> 28) & 0xFFFFFFFF
    time_mid = (timestamp >> 12) & 0xFFFF
    time_low = timestamp & 0x0FFF
    clock_seq = value.clock_seq & 0x3FFF
    node = value.node & 0xFFFFFFFFFFFF
    int_value = (
        (time_high << 96)
        | (time_mid << 80)
        | (0x6 << 76)
        | (time_low << 64)
        | ((0x80 | ((clock_seq >> 8) & 0x3F)) << 56)
        | ((clock_seq & 0xFF) << 48)
        | node
    )
    return UUID(int=int_value)


NUTRIENT_SEED = [
    ("ME", "Обменная энергия", "main", "kcal"),
    ("CP", "Сырой протеин", "main", "g"),
    ("CFa", "Сырой жир", "main", "g"),
    ("CFi", "Сырая клетчатка", "main", "g"),
    ("CAs", "Сырая зола", "main", "g"),
    ("CH", "Углеводы", "main", "g"),
    ("MO", "Влага", "main", "g"),
    ("DM", "Сухое вещество", "main", "g"),
    ("Ca", "Кальций", "mineral", "mg"),
    ("P", "Фосфор", "mineral", "mg"),
    ("Mg", "Магний", "mineral", "mg"),
    ("Na", "Натрий", "mineral", "mg"),
    ("K", "Калий", "mineral", "mg"),
    ("Cl", "Хлор", "mineral", "mg"),
    ("Fe", "Железо", "mineral", "mg"),
    ("Cu", "Медь", "mineral", "mg"),
    ("Zn", "Цинк", "mineral", "mg"),
    ("Mn", "Марганец", "mineral", "mg"),
    ("Se", "Селен", "mineral", "mcg"),
    ("J", "Йод", "mineral", "mcg"),
    ("A", "Витамин A", "vitamin", "IU"),
    ("D", "Витамин D", "vitamin", "IU"),
    ("E", "Витамин E", "vitamin", "mg"),
    ("B1", "Витамин B1", "vitamin", "mg"),
    ("B2", "Витамин B2", "vitamin", "mg"),
    ("B3", "Витамин B3", "vitamin", "mg"),
    ("B4", "Витамин B4", "vitamin", "mg"),
    ("B5", "Витамин B5", "vitamin", "mg"),
    ("B6", "Витамин B6", "vitamin", "mg"),
    ("B7", "Витамин B7", "vitamin", "mcg"),
    ("B9", "Витамин B9", "vitamin", "mcg"),
    ("B12", "Витамин B12", "vitamin", "mcg"),
    ("C", "Витамин C", "vitamin", "mg"),
    ("His", "Гистидин", "amino_acid", "g"),
    ("Phe", "Фенилаланин", "amino_acid", "g"),
    ("Tau", "Таурин", "amino_acid", "g"),
    ("Thr", "Треонин", "amino_acid", "g"),
    ("Trp", "Триптофан", "amino_acid", "g"),
    ("Tyr", "Тирозин", "amino_acid", "g"),
    ("Val", "Валин", "amino_acid", "g"),
    ("Met", "Метионин", "amino_acid", "g"),
    ("Ile", "Изолейцин", "amino_acid", "g"),
    ("Lys", "Лизин", "amino_acid", "g"),
    ("Arg", "Аргинин", "amino_acid", "g"),
    ("Leu", "Лейцин", "amino_acid", "g"),
    ("Cys", "Цистеин", "amino_acid", "g"),
    ("LA", "Линолевая кислота", "fatty_acid", "g"),
    ("ALA", "Альфа-линоленовая кислота", "fatty_acid", "g"),
    ("AA", "Арахидоновая кислота", "fatty_acid", "g"),
    ("EPA", "Эйкозапентаеновая кислота", "fatty_acid", "g"),
    ("DHA", "Докозагексаеновая кислота", "fatty_acid", "g"),
]


def upgrade() -> None:
    op.create_table(
        "nutrients",
        sa.Column("uuid", sa.Uuid(), nullable=False),
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("category", sa.String(length=32), nullable=False),
        sa.Column("base_unit", sa.String(length=32), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "category IN ('main', 'mineral', 'vitamin', 'amino_acid', 'fatty_acid')",
            name="ck_nutrients_category",
        ),
        sa.PrimaryKeyConstraint("uuid"),
        sa.UniqueConstraint("code"),
    )
    op.create_table(
        "foods",
        sa.Column("uuid", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("type", sa.String(length=32), nullable=False),
        sa.Column("feed_form", sa.String(length=32), nullable=False, server_default="unknown"),
        sa.Column("category", sa.String(length=255), nullable=True),
        sa.Column("subcategory", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "type IN ('commercial', 'ingredient', 'supplement')",
            name="ck_foods_type",
        ),
        sa.CheckConstraint(
            "feed_form IN ('dry', 'wet', 'unknown')",
            name="ck_foods_feed_form",
        ),
        sa.PrimaryKeyConstraint("uuid"),
    )
    op.create_index("ix_foods_name", "foods", ["name"])
    op.create_table(
        "food_nutrient_values",
        sa.Column("uuid", sa.Uuid(), nullable=False),
        sa.Column("food_uuid", sa.Uuid(), nullable=False),
        sa.Column("nutrient_uuid", sa.Uuid(), nullable=False),
        sa.Column("value", sa.Numeric(18, 8), nullable=True),
        sa.Column("basis", sa.String(length=32), nullable=False),
        sa.Column("value_status", sa.String(length=32), nullable=False, server_default="measured"),
        sa.Column("source_uuid", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "basis IN ('per_100g_as_fed', 'per_100g_dm', 'per_1000_kcal', 'per_mj')",
            name="ck_food_nutrient_values_basis",
        ),
        sa.CheckConstraint(
            "value_status IN ('measured', 'calculated', 'estimated', 'trace', "
            "'not_detected', 'unknown')",
            name="ck_food_nutrient_values_status",
        ),
        sa.ForeignKeyConstraint(["food_uuid"], ["foods.uuid"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["nutrient_uuid"], ["nutrients.uuid"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("uuid"),
        sa.UniqueConstraint(
            "food_uuid",
            "nutrient_uuid",
            "basis",
            "source_uuid",
            name="uq_food_nutrient_values_identity",
        ),
    )
    op.create_index("ix_food_nutrient_values_food_uuid", "food_nutrient_values", ["food_uuid"])
    op.create_index("ix_food_nutrient_values_nutrient_uuid", "food_nutrient_values", ["nutrient_uuid"])
    op.create_table(
        "nutrient_groups",
        sa.Column("uuid", sa.Uuid(), nullable=False),
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("uuid"),
        sa.UniqueConstraint("code"),
    )
    op.create_table(
        "nutrient_group_members",
        sa.Column("group_uuid", sa.Uuid(), nullable=False),
        sa.Column("nutrient_uuid", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["group_uuid"], ["nutrient_groups.uuid"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["nutrient_uuid"], ["nutrients.uuid"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("group_uuid", "nutrient_uuid"),
    )
    op.create_table(
        "nutrient_aliases",
        sa.Column("uuid", sa.Uuid(), nullable=False),
        sa.Column("namespace", sa.String(length=32), nullable=False),
        sa.Column("alias", sa.String(length=255), nullable=False),
        sa.Column("nutrient_uuid", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "namespace IN ('fediaf_legacy', 'product')",
            name="ck_nutrient_aliases_namespace",
        ),
        sa.ForeignKeyConstraint(["nutrient_uuid"], ["nutrients.uuid"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("uuid"),
        sa.UniqueConstraint("namespace", "alias", name="uq_nutrient_aliases_namespace_alias"),
    )
    now = datetime.now(timezone.utc)
    nutrient_table = sa.table(
        "nutrients",
        sa.column("uuid", sa.Uuid()),
        sa.column("code", sa.String()),
        sa.column("name", sa.String()),
        sa.column("category", sa.String()),
        sa.column("base_unit", sa.String()),
        sa.column("sort_order", sa.Integer()),
        sa.column("is_active", sa.Boolean()),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )
    nutrient_ids = {code: _uuid6() for code, _, _, _ in NUTRIENT_SEED}
    op.bulk_insert(
        nutrient_table,
        [
            {
                "uuid": nutrient_ids[code],
                "code": code,
                "name": name,
                "category": category,
                "base_unit": unit,
                "sort_order": index,
                "is_active": True,
                "created_at": now,
                "updated_at": now,
            }
            for index, (code, name, category, unit) in enumerate(NUTRIENT_SEED, start=1)
        ],
    )

    group_table = sa.table(
        "nutrient_groups",
        sa.column("uuid", sa.Uuid()),
        sa.column("code", sa.String()),
        sa.column("name", sa.String()),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )
    group_ids = {"OMEGA_3": _uuid6(), "OMEGA_6": _uuid6()}
    op.bulk_insert(
        group_table,
        [
            {"uuid": group_ids["OMEGA_3"], "code": "OMEGA_3", "name": "Омега-3", "created_at": now, "updated_at": now},
            {"uuid": group_ids["OMEGA_6"], "code": "OMEGA_6", "name": "Омега-6", "created_at": now, "updated_at": now},
        ],
    )
    member_table = sa.table(
        "nutrient_group_members",
        sa.column("group_uuid", sa.Uuid()),
        sa.column("nutrient_uuid", sa.Uuid()),
    )
    op.bulk_insert(
        member_table,
        [
            {"group_uuid": group_ids[group], "nutrient_uuid": nutrient_ids[code]}
            for group, codes in (("OMEGA_3", ("ALA", "EPA", "DHA")), ("OMEGA_6", ("LA", "AA")))
            for code in codes
        ],
    )


def downgrade() -> None:
    op.drop_table("nutrient_aliases")
    op.drop_table("nutrient_group_members")
    op.drop_table("nutrient_groups")
    op.drop_index("ix_food_nutrient_values_nutrient_uuid", table_name="food_nutrient_values")
    op.drop_index("ix_food_nutrient_values_food_uuid", table_name="food_nutrient_values")
    op.drop_table("food_nutrient_values")
    op.drop_index("ix_foods_name", table_name="foods")
    op.drop_table("foods")
    op.drop_table("nutrients")
