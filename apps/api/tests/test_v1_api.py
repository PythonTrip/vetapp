"""v1 compatibility, schema coverage and real session boundary regressions."""

import pytest
import httpx
from fastapi.testclient import TestClient
from starlette.requests import Request

from tests.test_owner_cabinet import cabinet  # noqa: F401 - shared isolated SQLite fixture
from vetdietderm_api import auth
from vetdietderm_api.v1 import OWNER_AUTH_PATHS
from vetdietderm_api.v1_security import require_owner_identity


def without_titles(value):
    if isinstance(value, dict):
        return {key: without_titles(item) for key, item in value.items() if key != "title"}
    if isinstance(value, list):
        return [without_titles(item) for item in value]
    return value


def test_schema_covers_legacy_resources_and_documents_separate_security(cabinet):
    staff, _, _, _ = cabinet
    schema = staff.app.openapi()
    paths = schema["paths"]
    ids = []
    for path, operations in paths.items():
        if path.startswith("/auth-service") or path in {"/health", "/ready"}:
            continue
        if not path.startswith("/v1/"):
            target = (("/v1/auth" + path) if path in OWNER_AUTH_PATHS else
                      ("/v1" + path) if path.startswith("/owner/") else
                      ("/v1/staff" + path))
            assert set(operations) <= set(paths[target]), path
            for method, operation in operations.items():
                if path not in {"/owner/logout", "/owner/files/{attachment_id}",
                                "/owner/visits/{request_id}/files/{file_id}"}:
                    assert without_titles(operation["responses"].get("201") or operation["responses"].get("200")) == without_titles(
                        paths[target][method]["responses"].get("201") or paths[target][method]["responses"].get("200")), path
        else:
            for operation in operations.values():
                ids.append(operation["operationId"])
                if path.startswith("/v1/staff/") or path == "/v1/auth/staff/me" or path == "/v1/auth/staff/refresh":
                    assert operation["security"] == [{"StaffSession": []}], path
                elif path.startswith("/v1/owner/"):
                    assert operation["security"] == [{"OwnerSession": []}], path
                else:
                    assert not operation.get("security"), path
                assert operation["responses"]["422"]["content"]["application/json"]["schema"] == {
                    "$ref": "#/components/schemas/ErrorResponse"}
    assert len(ids) == len(set(ids))
    assert schema["components"]["securitySchemes"]["StaffSession"]["name"] == auth.COOKIE
    assert "{path}" not in " ".join(path for path in paths if path.startswith("/v1/"))
    file_response = paths["/v1/owner/files/{attachment_id}"]["get"]["responses"]["200"]
    assert "application/octet-stream" in file_response["content"]
    upload = paths["/v1/owner/visits/{request_id}/files"]["post"]["requestBody"]
    assert "multipart/form-data" in upload["content"]


def register_owner(staff, owner, email="owner@example.com"):
    code = staff.get("/v1/staff/join-codes/current").json()["code"]
    response = owner.post("/v1/auth/owner/register", json=dict(
        code=code, name="Owner", email=email, phone="123", password="a long password here"))
    assert response.status_code == 201, response.text


def test_versions_share_state_and_realms_do_not_accept_each_others_sessions(cabinet):
    staff, owner, _, _ = cabinet
    register_owner(staff, owner)
    assert owner.get("/v1/owner/me").json() == owner.get("/owner/me").json()
    assert owner.get("/v1/owner/animals").json() == []
    created = owner.post("/v1/owner/animals", json={"name": "Pet", "species": "dog"})
    assert created.status_code == 201, created.text
    assert owner.get("/owner/animals").json() == [created.json()]
    assert owner.patch("/owner/animals/" + created.json()["uuid"], json={"name": "Updated"}).status_code == 200
    assert owner.get("/v1/owner/animals").json()[0]["name"] == "Updated"
    with TestClient(staff.app, headers={"X-Vetapp-CSRF": "1", "Origin": "http://testserver"}) as other:
        register_owner(staff, other, "other@example.com")
        assert other.get("/v1/owner/animals").json() == []
        assert other.patch("/v1/owner/animals/" + created.json()["uuid"], json={"name": "Stolen"}).status_code == 404
    assert staff.get("/v1/staff/clients").json() == staff.get("/clients").json() == []
    for path in ("/v1/staff/clients", "/v1/staff/visit-requests", "/v1/auth/staff/me"):
        response = owner.get(path)
        assert response.status_code == 401, response.text
        assert response.json()["error"]["code"] == "unauthenticated"
    for path in ("/v1/owner/me", "/v1/owner/animals"):
        assert staff.get(path).status_code == 401
    # Both cookies can coexist; revoking owner credentials must not revoke staff.
    owner.cookies.set(auth.COOKIE, staff.cookies.get(auth.COOKIE))
    assert owner.get("/v1/auth/staff/me").status_code == 200
    assert owner.post("/v1/auth/owner/logout").json() == {"ok": True}
    assert owner.get("/v1/owner/me").status_code == 401
    assert owner.get("/v1/auth/staff/me").status_code == 200
    assert owner.post("/owner/login", json=dict(email="owner@example.com", password="a long password here")).status_code == 200
    assert owner.get("/v1/owner/me").status_code == 200


def test_v1_errors_validation_csrf_and_legacy_compatibility(cabinet):
    staff, owner, _, _ = cabinet
    assert owner.get("/owner/join/missing").json() == {"detail": "Код не найден"}
    for path in ("/v1/auth/owner/join/missing", "/v1/missing"):
        response = owner.get(path)
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "not_found"
    response = owner.post("/v1/auth/staff/login", json={"password": "DO-NOT-ECHO"})
    assert response.status_code == 422
    assert "DO-NOT-ECHO" not in response.text
    assert response.json()["error"]["details"][0]["loc"] == ["body", "email"]
    assert owner.get("/v1/auth/staff/login").status_code == 405
    for headers in ({"X-Vetapp-CSRF": "0"}, {"Origin": "https://evil.example"}):
        response = owner.post("/v1/auth/owner/login", headers=headers, json={})
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "forbidden"

    def crash():
        raise RuntimeError("internal secret")

    staff.app.dependency_overrides[require_owner_identity] = crash
    try:
        with TestClient(staff.app, raise_server_exceptions=False) as client:
            response = client.get("/v1/owner/me")
        assert response.status_code == 500
        assert response.json()["error"]["code"] == "internal_error"
        assert "internal secret" not in response.text
    finally:
        staff.app.dependency_overrides.clear()


def test_v1_login_refresh_and_legacy_session_interoperate(cabinet, monkeypatch):
    _, client, _, user = cabinet
    calls = []

    def remote(method, path, body=None, token=None):
        calls.append(path)
        if path in {"/auth/login", "/auth/refresh"}:
            return httpx.Response(200, json=dict(access_token="new-access", refresh_token="new-refresh",
                expires_in=900, refresh_token_expires_in=3600))
        if path == "/auth/logout":
            return httpx.Response(200, json={"detail": "Logged out"})
        assert path == "/me"
        return httpx.Response(200, json=user)

    monkeypatch.setattr(auth, "upstream", remote)
    response = client.post("/v1/auth/staff/login", json={"email": "doctor@example.com", "password": "secret"})
    assert response.json() == {"ok": True}
    assert "new-access" not in response.text and "new-refresh" not in response.text
    assert client.get("/auth-service/me").status_code == 200
    assert client.post("/v1/auth/staff/refresh").status_code == 200
    assert calls.count("/auth/refresh") == 1
    assert client.post("/v1/auth/staff/logout").status_code == 200
    assert client.get("/auth-service/me").status_code == 401
    assert client.get("/v1/auth/staff/me").status_code == 401


def test_multiple_client_origins_share_cors_csrf_and_secure_cookie_configuration(cabinet, monkeypatch):
    from vetdietderm_api import main
    from vetdietderm_api.settings import Settings

    settings = Settings(_env_file=None, DATABASE_URL="sqlite://",
        FRONTEND_URL="https://primary.example", API_ALLOWED_ORIGINS=["https://second.example/"],
        AUTH_COOKIE_SECURE=True, AUTH_COOKIE_SAMESITE="none")
    monkeypatch.setattr(main, "get_settings", lambda: settings)
    monkeypatch.setattr(auth, "get_settings", lambda: settings)
    with TestClient(main.create_app(), base_url="https://api.example") as client:
        response = client.options("/v1/auth/staff/login", headers={
            "Origin": "https://second.example", "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "X-Vetapp-CSRF,Content-Type"})
        assert response.status_code == 200
        assert response.headers["access-control-allow-origin"] == "https://second.example"
        assert response.headers["access-control-allow-credentials"] == "true"
        response = client.post("/v1/auth/staff/login", json={"email": "doctor@example.com", "password": "secret"},
            headers={"Origin": "https://second.example", "X-Vetapp-CSRF": "1"})
        assert response.status_code == 200
        assert "SameSite=none" in response.headers["set-cookie"] and "Secure" in response.headers["set-cookie"]
        response = client.post("/v1/auth/staff/login", json={},
            headers={"Origin": "https://untrusted.example", "X-Vetapp-CSRF": "1"})
        assert response.status_code == 403
        assert "access-control-allow-origin" not in response.headers
    with pytest.raises(ValueError):
        Settings(_env_file=None, DATABASE_URL="sqlite://", API_ALLOWED_ORIGINS=["*"])
    with pytest.raises(ValueError):
        Settings(_env_file=None, DATABASE_URL="sqlite://", AUTH_COOKIE_SAMESITE="none", AUTH_COOKIE_SECURE=False)

    def crash():
        raise RuntimeError("internal secret")

    app = main.create_app()
    app.dependency_overrides[require_owner_identity] = crash
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.get("/v1/owner/me", headers={"Origin": "https://second.example"})
        assert response.status_code == 500
        assert response.headers["access-control-allow-origin"] == "https://second.example"
        assert response.headers["access-control-allow-credentials"] == "true"
        assert response.json()["error"]["code"] == "internal_error"


@pytest.mark.parametrize("prefix", ["", "/v1/staff"])
def test_versioned_resource_policies_keep_catalog_and_observer_boundaries(prefix):
    user = {"organization": {"status": "active", "org_id": "org", "org_role": "viewer"}}

    def request(path):
        return Request({"type": "http", "method": "POST", "path": prefix + path,
                        "headers": [(b"x-vetapp-workspace", b"organization")]})

    with pytest.raises(auth.HTTPException) as exc:
        auth.require_clinical_access(request("/patients"), user)
    assert exc.value.status_code == 403
    auth.require_clinical_access(request("/assessments/energy"), user)
    user["organization"]["org_role"] = "member"
    with pytest.raises(auth.HTTPException) as exc:
        auth.require_clinical_access(request("/foods"), user)
    assert exc.value.status_code == 403
    user["role"] = "super_admin"
    auth.require_clinical_access(request("/foods"), user)
