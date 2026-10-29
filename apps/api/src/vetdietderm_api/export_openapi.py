"""Export the actual FastAPI schema without starting services or reading secrets."""

import json


def main() -> None:
    from vetdietderm_api.settings import Settings, get_settings

    # Importing the app validates settings. Use an explicit, inert configuration;
    # neither developer .env files nor a database connection are needed.
    get_settings.cache_clear()
    settings = Settings(_env_file=None, DATABASE_URL="postgresql+psycopg://schema:schema@localhost/schema")
    from unittest.mock import patch

    with patch("vetdietderm_api.settings.get_settings", return_value=settings):
        from vetdietderm_api.main import app

        print(json.dumps(app.openapi(), ensure_ascii=False, sort_keys=True, indent=2))


if __name__ == "__main__":
    main()
