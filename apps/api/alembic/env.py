from logging.config import fileConfig

from alembic import context

from vetdietderm_api.db import Base, get_engine, sqlalchemy_url
from vetdietderm_api.appointments import models as appointment_models  # noqa: F401
from vetdietderm_api.assessments import models as assessment_models  # noqa: F401
from vetdietderm_api.attachments import models as attachment_models  # noqa: F401
from vetdietderm_api.catalog import models as catalog_models  # noqa: F401
from vetdietderm_api.clinical_catalog import models as clinical_catalog_models  # noqa: F401
from vetdietderm_api.communications import models as communication_models  # noqa: F401
from vetdietderm_api.encounters import models as encounter_models  # noqa: F401
from vetdietderm_api.encounter_templates import models as encounter_template_models  # noqa: F401
from vetdietderm_api.guidelines import models as guideline_models  # noqa: F401
from vetdietderm_api.patients import models as patient_models  # noqa: F401
from vetdietderm_api.settings import get_settings

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

settings = get_settings()
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=sqlalchemy_url(settings.DATABASE_URL),
        target_metadata=target_metadata,
        literal_binds=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = get_engine()
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
