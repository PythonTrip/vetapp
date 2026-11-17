from logging.config import fileConfig

from alembic import context

from vetdietderm_api.db import Base, get_engine, sqlalchemy_url
from vetdietderm_api.guidelines import models as guideline_models  # noqa: F401 - historical migration metadata
from vetdietderm_api.orm import load_models
from vetdietderm_api.settings import get_settings

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

settings = get_settings()
load_models()
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
