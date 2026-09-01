from sqlalchemy import inspect
from sqlalchemy.orm import Session


class LegacyGuidelineRuntimeArchivedError(RuntimeError):
    pass


def require_legacy_runtime_tables(session: Session) -> None:
    """Fail clearly when a pre-provider SQL command is used after revision 0019."""
    bind = session.get_bind()
    if not inspect(bind).has_table("guideline_profiles", schema="public"):
        raise LegacyGuidelineRuntimeArchivedError(
            "SQL-backed guideline runtime tables are archived in schema "
            "legacy_guidelines. Use StandardRegistry providers, or downgrade "
            "Alembic to 0018 only for an intentional legacy rollback."
        )
