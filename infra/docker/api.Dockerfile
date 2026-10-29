FROM python:3.13-slim

COPY --from=ghcr.io/astral-sh/uv:0.9.26 /uv /usr/local/bin/uv
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    PATH="/app/apps/api/.venv/bin:$PATH"
WORKDIR /app/apps/api
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY src ./src
COPY alembic ./alembic
COPY alembic.ini ./
RUN uv sync --frozen --no-dev \
    && useradd --create-home app \
    && mkdir -p /data/attachments \
    && chown -R app:app /data
USER app
EXPOSE 8000
CMD ["uvicorn", "vetdietderm_api.main:app", "--host", "0.0.0.0", "--port", "8000"]
