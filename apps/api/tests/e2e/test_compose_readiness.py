import json
import os
import shutil
import subprocess
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from secrets import token_hex
from threading import Event
from time import monotonic

import httpx
import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL
from sqlalchemy.exc import OperationalError
from sqlalchemy.pool import NullPool

from tests.postgres_auth_stub import CSRF, sign_in_staff


API_ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT = API_ROOT.parents[1]
WEB_SERVICES = ("frontend", "owner-web")
LEGACY_REVISION = "0039_owner_problem_request"


class ComposeStack:
    def __init__(self, tmp_path):
        self.project = f"vetapp-qa-{token_hex(8)}"
        self.password = token_hex(24)
        self.env = {
            key: value
            for key, value in os.environ.items()
            if not key.upper().startswith(("COMPOSE_", "DOCKER_"))
        }
        self.env.update(
            {
                "DATABASE_ADDRESS": "postgres",
                "DATABASE_PORT": "5432",
                "DATABASE_NAME": "vetapp_qa",
                "DATABASE_USER": "vat_qa",
                "DATABASE_PASSWORD": self.password,
                "DATABASE_SSLMODE": "disable",
                "MODULE_AUTH_URL": "http://auth-stub:8080",
                "API_INTERNAL_URL": "http://vetapp-api:8000",
                "AUTH_COOKIE_SECURE": "false",
                "AUTH_COOKIE_SAMESITE": "lax",
                "OWNER_COOKIE_SAMESITE": "lax",
                "TELEGRAM_BOT_USERNAME": "",
                "TELEGRAM_BOT_TOKEN": "",
                "TELEGRAM_INIT_DATA_MAX_AGE": "300",
                "TELEGRAM_WEB_ENABLED": "false",
                "FRONTEND_URL": "http://127.0.0.1",
                "OWNER_FRONTEND_URL": "http://127.0.0.1",
                "API_ALLOWED_ORIGINS": "[]",
                "NEXT_PUBLIC_API_URL": "/api",
            }
        )
        stub = (API_ROOT / "tests" / "postgres_auth_stub.py").read_text(
            encoding="utf-8"
        )
        override = tmp_path / "compose.override.yaml"
        # Unique resource names and random loopback ports permit parallel QA runs.
        override.write_text(
            f"""
services:
  api:
    container_name: {self.project}-api
    ports: !override ["127.0.0.1::8000"]
  frontend:
    container_name: {self.project}-frontend
    ports: !override ["127.0.0.1::3000"]
  owner-web:
    container_name: {self.project}-owner
    ports: !override ["127.0.0.1::3000"]
  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: vetapp_qa
      POSTGRES_USER: vat_qa
      POSTGRES_PASSWORD: ${{DATABASE_PASSWORD}}
    ports: ["127.0.0.1::5432"]
    tmpfs: ["/var/lib/postgresql/data"]
    networks: [shared]
  auth-stub:
    image: {self.project}-api
    entrypoint: ["python", "-c", {json.dumps(stub)}]
    networks: [shared]
networks:
  shared:
    name: {self.project}
    external: false
""",
            encoding="utf-8",
        )
        interpolation = tmp_path / "compose-interpolation.txt"
        interpolation.touch()
        self.compose_args = (
            "compose",
            "--env-file",
            str(interpolation),
            "--project-name",
            self.project,
            "--file",
            str(REPO_ROOT / "infra" / "docker-compose.yml"),
            "--file",
            str(override),
            "--profile",
            "owner",
        )

    def docker(self, *args, timeout=30):
        result = subprocess.run(
            ("docker", *args),
            cwd=REPO_ROOT,
            env=self.env,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
            check=False,
        )
        assert result.returncode == 0, (
            f"docker {' '.join(args)}: {result.stderr.strip()}"
        )
        return result.stdout.strip()

    def compose(self, *args, timeout=30):
        return self.docker(*self.compose_args, *args, timeout=timeout)

    def state(self, service):
        container = self.compose("ps", "--all", "--quiet", service)
        if not container:
            return {}
        return json.loads(
            self.docker("inspect", "--format", "{{json .State}}", container)
        )

    def address(self, service, port):
        address = self.compose("port", service, str(port))
        host, published = address.rsplit(":", 1)
        assert host == "127.0.0.1"
        return f"http://{address}", int(published)


def wait_until(probe, seconds, description):
    deadline = monotonic() + seconds
    interval = Event()
    while monotonic() < deadline:
        value = probe()
        if value:
            return value
        interval.wait(0.2)
    pytest.fail(f"Timed out waiting for {description}")


@pytest.fixture
def compose_stack(postgres_qa_settings, tmp_path):
    if not postgres_qa_settings.compose:
        pytest.skip("Set VAT_QA_COMPOSE=1 for a disposable local Docker Compose run")
    if not shutil.which("docker"):
        pytest.skip("Docker CLI is unavailable")
    stack = ComposeStack(tmp_path)
    context = stack.docker(
        "context", "inspect", "--format", "{{.Endpoints.docker.Host}}"
    )
    assert context.startswith(("npipe://", "unix://")), (
        "The Compose check requires a local Docker engine"
    )
    stack.compose("config", "--quiet")
    stack.docker("info", "--format", "{{.ServerVersion}}")
    try:
        stack.compose("build", "api", *WEB_SERVICES, timeout=900)
        stack.compose("up", "--detach", "postgres", timeout=180)
        yield stack
    finally:
        stack.compose(
            "down", "--volumes", "--remove-orphans", "--rmi", "local", timeout=120
        )


def test_compose_waits_for_migrated_api(compose_stack):
    """CHECK-API-PG-COMPOSE-READINESS"""
    stack = compose_stack
    _, pg_port = stack.address("postgres", 5432)
    engine = create_engine(
        URL.create(
            "postgresql+psycopg",
            username="vat_qa",
            password=stack.password,
            host="127.0.0.1",
            port=pg_port,
            database="vetapp_qa",
        ),
        poolclass=NullPool,
        connect_args={"connect_timeout": 2},
    )

    def postgres_is_reachable():
        try:
            with engine.connect() as db:
                return db.scalar(text("SELECT 1")) == 1
        except OperationalError:
            return False

    try:
        wait_until(postgres_is_reachable, 30, "PostgreSQL to accept TCP queries")
        stack.compose(
            "run",
            "--rm",
            "--no-deps",
            "api",
            "alembic",
            "upgrade",
            LEGACY_REVISION,
            timeout=120,
        )
        with ThreadPoolExecutor(max_workers=1) as executor:
            with engine.begin() as lock:
                assert (
                    lock.execute(
                        text("SELECT version_num FROM alembic_version")
                    ).scalar_one()
                    == LEGACY_REVISION
                )
                lock.execute(text("LOCK TABLE appointments IN ACCESS SHARE MODE"))
                lock_pid = lock.scalar(text("SELECT pg_backend_pid()"))
                starting = executor.submit(
                    stack.compose,
                    "up",
                    "--detach",
                    "--no-build",
                    "auth-stub",
                    "api",
                    *WEB_SERVICES,
                    timeout=240,
                )

                def migration_is_blocked():
                    with engine.connect() as monitor:
                        return monitor.scalar(
                            text("""
                            SELECT EXISTS (
                                SELECT 1 FROM pg_stat_activity
                                WHERE datname = current_database()
                                  AND :holder = ANY(pg_blocking_pids(pid))
                            )
                        """),
                            {"holder": lock_pid},
                        )

                wait_until(
                    migration_is_blocked, 60, "Alembic to wait on the appointments lock"
                )
                assert postgres_is_reachable()

                def api_health_attempt():
                    health = stack.state("api").get("Health", {})
                    return health if health.get("Log") else None

                health_during_migration = wait_until(
                    api_health_attempt, 75, "the API health probe to run"
                )
                assert migration_is_blocked()
                web_started_early = {
                    service: state.get("StartedAt")
                    for service in WEB_SERVICES
                    if (state := stack.state(service))
                    and not state.get("StartedAt", "").startswith("0001-01-01")
                }
            starting.result()

        config = Config()
        config.set_main_option("script_location", str(API_ROOT / "alembic"))
        head = ScriptDirectory.from_config(config).get_current_head()
        assert head is not None

        def database_at_head():
            with engine.connect() as db:
                return (
                    db.execute(
                        text("SELECT version_num FROM alembic_version")
                    ).scalar_one()
                    == head
                )

        wait_until(database_at_head, 30, f"the database to reach Alembic head {head}")
        assert stack.state("api")["Health"]["Status"] == "healthy"
        check_http_and_proxies(stack)
        assert (
            health_during_migration["Status"] != "healthy" and not web_started_early
        ), (
            f"While Alembic waited: API health={health_during_migration['Status']}, "
            f"web services already started={web_started_early}"
        )
    finally:
        engine.dispose()


def check_http_and_proxies(stack):
    api, _ = stack.address("api", 8000)
    clinic, _ = stack.address("frontend", 3000)
    cabinet, _ = stack.address("owner-web", 3000)
    with (
        httpx.Client(base_url=api, headers=CSRF, trust_env=False) as staff,
        httpx.Client(base_url=api, headers=CSRF, trust_env=False) as owner,
    ):

        def get_health():
            try:
                return staff.get("/health").status_code == 200
            except httpx.TransportError:
                return False

        wait_until(get_health, 30, "Uvicorn to serve /health")
        sign_in_staff(staff)
        join = staff.get("/join-codes/current")
        assert join.status_code == 200, join.text
        registered = owner.post(
            "/owner/register",
            json={
                "code": join.json()["code"],
                "name": "Readiness owner",
                "email": "readiness@example.test",
                "phone": "+70000000000",
                "password": "synthetic readiness password",
            },
        )
        assert registered.status_code == 201, registered.text
        staff_cookie = staff.cookies.get("vetapp_session")
        owner_cookie = owner.cookies.get("vetapp_owner_session")
        assert staff_cookie and owner_cookie

        def proxy_read(path, cookie):
            try:
                response = httpx.get(
                    path, headers={"Cookie": cookie}, trust_env=False, timeout=3
                )
            except httpx.TransportError:
                return None
            return response if response.status_code != 502 else None

        staff_read = wait_until(
            lambda: proxy_read(
                f"{clinic}/api/join-codes/current", f"vetapp_session={staff_cookie}"
            ),
            45,
            "the clinic web proxy to reach the database-backed join-code route",
        )
        assert staff_read.status_code == 200, staff_read.text
        assert staff_read.json()["code"] == join.json()["code"]
        owner_read = wait_until(
            lambda: proxy_read(
                f"{cabinet}/api/owner/me", f"vetapp_owner_session={owner_cookie}"
            ),
            45,
            "the owner web proxy to reach the database-backed profile route",
        )
        assert owner_read.status_code == 200, owner_read.text
        assert owner_read.json()["email"] == "readiness@example.test"
