"""Create encounter templates and remove retired encounter fields.

Revision ID: 0011_encounter_templates
Revises: 0010_canonical_fediaf_nutrients
Create Date: 2026-08-29
"""

from datetime import datetime, timezone
from typing import Sequence, Union
from uuid import uuid4

import sqlalchemy as sa
from alembic import op

revision: str = "0011_encounter_templates"
down_revision: Union[str, Sequence[str], None] = "0010_canonical_fediaf_nutrients"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


STANDARD_TEMPLATES = (
    ("anamnesis", "general", "Первичный общий приём", "Жалобы появились . Динамика симптомов: . Ранее проводилось лечение: . Реакция на лечение: . Сопутствующие заболевания и постоянные препараты: ."),
    ("anamnesis", "dermatology", "Первичный дерматологический анамнез", "Зуд отмечается в течение . Первичная локализация: . Сезонность: . Обработки от эктопаразитов: . Рацион и лакомства: . Другие животные и симптомы у людей: . Ранее применённая терапия и ответ: ."),
    ("anamnesis", "nutrition", "Диетологический анамнез", "Текущий рацион: . Суточное количество и режим кормления: . Лакомства и добавки: . Аппетит: . Стул и рвота: . Динамика веса: . Цель обращения: ."),
    ("exam", "general", "Общий клинический осмотр", "Общее состояние: . Сознание и поведение: . Слизистые: . Лимфатические узлы: . Сердечно-сосудистая система: . Дыхательная система: . Пищеварительная система: . Температура: ."),
    ("exam", "dermatology", "Дерматологический осмотр", "Кожа и шерсть: . Первичные элементы: . Вторичные элементы: . Локализация и симметрия: . Лапы и межпальцевые пространства: . Ушные раковины и слуховые проходы: . Цитология / соскоб: ."),
    ("exam", "nutrition", "Нутриционный осмотр", "Масса тела: . BCS: /9. MCS: . Гидратация: . Состояние шерсти и кожи: . Ротовая полость: . Пальпация живота: ."),
    ("plan", "general", "Базовый план", "Диагностические исследования: . Назначения: . Рекомендации владельцу: . Контрольный визит: . Поводы обратиться раньше: ."),
    ("plan", "dermatology", "План при зуде", "Контроль эктопаразитов: . Местная терапия: . Системная терапия: . Диагностический план: . Контроль VAS и фото: . Дата повторного осмотра: ."),
    ("plan", "nutrition", "План коррекции рациона", "Целевой рацион и калорийность: . Переход на рацион: . Лакомства и добавки: . Контроль массы тела: . Оценка переносимости: . Дата повторного осмотра: ."),
)


def upgrade() -> None:
    op.create_table(
        "encounter_templates",
        sa.Column("uuid", sa.Uuid(), nullable=False),
        sa.Column("scope", sa.String(length=16), nullable=False),
        sa.Column("section", sa.String(length=16), nullable=False),
        sa.Column("specialty", sa.String(length=32), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("doctor_name", sa.String(length=160), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("scope IN ('standard', 'clinic', 'doctor')", name="ck_encounter_templates_scope"),
        sa.CheckConstraint("section IN ('anamnesis', 'exam', 'plan')", name="ck_encounter_templates_section"),
        sa.CheckConstraint("specialty IN ('dermatology', 'nutrition', 'general')", name="ck_encounter_templates_specialty"),
        sa.CheckConstraint("scope != 'doctor' OR doctor_name IS NOT NULL", name="ck_encounter_templates_doctor"),
        sa.PrimaryKeyConstraint("uuid"),
    )
    op.create_index(
        "ix_encounter_templates_lookup",
        "encounter_templates",
        ["section", "specialty", "scope"],
    )

    table = sa.table(
        "encounter_templates",
        sa.column("uuid", sa.Uuid()),
        sa.column("scope", sa.String()),
        sa.column("section", sa.String()),
        sa.column("specialty", sa.String()),
        sa.column("title", sa.String()),
        sa.column("body", sa.Text()),
        sa.column("doctor_name", sa.String()),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )
    now = datetime.now(timezone.utc)
    op.bulk_insert(
        table,
        [
            {
                "uuid": uuid4(),
                "scope": "standard",
                "section": section,
                "specialty": specialty,
                "title": title,
                "body": body,
                "doctor_name": None,
                "created_at": now,
                "updated_at": now,
            }
            for section, specialty, title, body in STANDARD_TEMPLATES
        ],
    )

    op.drop_column("encounters", "assessment")
    op.drop_column("encounters", "follow_up")


def downgrade() -> None:
    op.add_column("encounters", sa.Column("follow_up", sa.Text(), nullable=True))
    op.add_column("encounters", sa.Column("assessment", sa.Text(), nullable=True))
    op.drop_index("ix_encounter_templates_lookup", table_name="encounter_templates")
    op.drop_table("encounter_templates")
