"""Exercise the actual repair against eligible and excluded provenance rows."""
import runpy
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
import sqlalchemy as sa


def test_owner_gallery_ownership_repair():
    metadata = sa.MetaData()
    patients = sa.Table("patients", metadata,
                        sa.Column("uuid", sa.String, primary_key=True),
                        sa.Column("tenant_id", sa.String), sa.Column("created_by", sa.String))
    attachments = sa.Table("attachments", metadata,
                           sa.Column("uuid", sa.String, primary_key=True),
                           sa.Column("patient_uuid", sa.String),
                           sa.Column("uploaded_by_owner", sa.Boolean),
                           sa.Column("tenant_id", sa.String), sa.Column("created_by", sa.String))
    migration = runpy.run_path(str(Path(__file__).resolve().parents[1] /
                                  "alembic/versions/0034_owner_gallery_ownership.py"))
    engine = sa.create_engine("sqlite://")
    try:
        with engine.begin() as connection:
            metadata.create_all(connection)
            connection.execute(patients.insert(), [
                dict(uuid="personal", tenant_id=None, created_by="doctor"),
                dict(uuid="org", tenant_id="clinic", created_by="inviter"),
                dict(uuid="unknown", tenant_id="clinic", created_by=None),
            ])
            rows = [
                dict(uuid="personal", patient_uuid="personal", uploaded_by_owner=True, tenant_id=None, created_by=None),
                dict(uuid="org", patient_uuid="org", uploaded_by_owner=True, tenant_id=None, created_by=None),
                dict(uuid="unknown", patient_uuid="unknown", uploaded_by_owner=True, tenant_id=None, created_by=None),
                dict(uuid="clinical", patient_uuid="org", uploaded_by_owner=False, tenant_id=None, created_by=None),
                dict(uuid="tenant_only", patient_uuid="org", uploaded_by_owner=True, tenant_id="existing", created_by=None),
                dict(uuid="author_only", patient_uuid="org", uploaded_by_owner=True, tenant_id=None, created_by="existing"),
                dict(uuid="owned", patient_uuid="org", uploaded_by_owner=True, tenant_id="existing", created_by="existing"),
                dict(uuid="orphan", patient_uuid="absent", uploaded_by_owner=True, tenant_id=None, created_by=None),
            ]
            connection.execute(attachments.insert(), rows)
            expected = [dict(row) for row in rows]
            expected[0]["created_by"] = "doctor"
            expected[1].update(tenant_id="clinic", created_by="inviter")

            def stored():
                return {row["uuid"]: dict(row) for row in connection.execute(sa.select(attachments)).mappings()}

            with Operations.context(MigrationContext.configure(connection)):
                migration["upgrade"]()
                assert stored() == {row["uuid"]: row for row in expected}
                migration["upgrade"]()  # Re-running cannot change repaired provenance.
                migration["downgrade"]()
                assert stored() == {row["uuid"]: row for row in expected}
    finally:
        engine.dispose()
