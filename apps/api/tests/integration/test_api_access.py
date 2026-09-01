from uuid import UUID

import pytest
from fastapi.testclient import TestClient


ZERO_UUID = UUID(int=0)
pytestmark = pytest.mark.integration


def test_health_ready_and_openapi_boundaries(api_client: TestClient) -> None:
    health = api_client.get("/health")
    assert health.status_code == 200
    assert health.json() == {"status": "ok"}

    openapi = api_client.get("/openapi.json")
    assert openapi.status_code == 200
    assert openapi.json()["info"]["title"] == "VetDietDerm API"

    ready = api_client.get("/ready")
    assert ready.status_code == 200
    assert ready.json() == {"status": "ok"}

    api_client.headers.pop("Authorization")
    paths = [
        "/ready",
        "/clients",
        f"/patients/{ZERO_UUID}/encounters",
        "/encounter-templates",
        f"/patients/{ZERO_UUID}/attachments",
        "/appointments",
        f"/patients/{ZERO_UUID}/communications",
        "/foods",
        "/guidelines/active",
        "/diet-plans",
    ]
    for path in paths:
        response = api_client.get(path)

        assert response.status_code == 401, path
        assert response.json() == {"detail": "Неверный пароль"}, path
        assert response.headers["www-authenticate"] == "Bearer", path

    wrong_token = api_client.get(
        "/clients",
        headers={"Authorization": "Bearer wrong-token"},
    )

    assert wrong_token.status_code == 401
    assert wrong_token.json() == {"detail": "Неверный пароль"}
    assert wrong_token.headers["www-authenticate"] == "Bearer"
