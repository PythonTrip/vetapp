"""Signed Telegram exchanges use the existing owner boundaries."""
import hashlib
import hmac
import json
import time
from urllib.parse import urlencode
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from tests.test_owner_cabinet import cabinet, register  # noqa: F401
from vetdietderm_api.owners import router as owners
from vetdietderm_api.owners.models import OwnerAccount, TelegramIdentity, TelegramExchange
from vetdietderm_api.owners.telegram import validate_init_data
from vetdietderm_api.settings import Settings

TOKEN = "123456:test-only-bot-token"


def signed(user=1234567890123, age=0, **extra):
    fields = dict(auth_date=str(int(time.time()) - age), user=json.dumps({"id": user, "first_name": "Owner"}), **extra)
    check = "\n".join(f"{k}={v}" for k, v in sorted(fields.items()))
    secret = hmac.digest(b"WebAppData", TOKEN.encode(), "sha256")
    fields["hash"] = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    return urlencode(fields)


def test_validation_signature_and_all_fields():
    raw = signed(signature="third-party-signature", future_field="value&with=delimiters")
    assert validate_init_data(raw, TOKEN, 300)[0] == "1234567890123"
    # Bot-backend signature includes the optional Ed25519 signature field.
    with pytest.raises(HTTPException) as error:
        validate_init_data(raw.replace("third-party-signature", "tampered"), TOKEN, 300)
    assert error.value.status_code == 401
    # Query ordering and encoding cannot evade the canonical replay key.
    assert validate_init_data("&".join(reversed(raw.split("&"))), TOKEN, 300)[1] == validate_init_data(raw, TOKEN, 300)[1]
    with pytest.raises(HTTPException):
        validate_init_data(raw, "different-bot-token", 300)


@pytest.mark.parametrize("raw", [
    "", "user=123", signed(age=301), signed(age=-60), signed(user=True), signed(user=-1),
    signed(user=2**52), signed() + "&user=%7B%7D", signed() + "&hash=00", signed() + "&x=%ZZ",
    signed().replace("1234567890123", "1234567890124"),
])
def test_invalid_or_expired_data(raw):
    with pytest.raises(HTTPException) as error:
        validate_init_data(raw, TOKEN, 300)
    assert error.value.status_code == 401


@pytest.fixture
def telegram(cabinet, monkeypatch):
    settings = Settings(DATABASE_URL="sqlite://", FRONTEND_URL="http://testserver", TELEGRAM_BOT_TOKEN=TOKEN)
    monkeypatch.setattr(owners, "get_settings", lambda: settings)
    return cabinet


def link_body(raw, email="owner@example.com", password=" password with spaces "):
    return dict(init_data=raw, email=email, password=password)


@pytest.mark.parametrize("workspace", ["personal", "organization"])
def test_link_login_replay_logout_and_doctor_binding(telegram, workspace):
    staff, owner, factory, user = telegram
    code = staff.get("/join-codes/current", headers={"X-Vetapp-Workspace": workspace}).json()["code"]
    account = register(owner, code).json()
    old_session = owner.cookies.get(owners.COOKIE)
    raw = signed(query_id="link")
    assert owner.post("/owner/telegram/link", json=link_body(raw, password="wrong")).status_code == 401
    result = owner.post("/owner/telegram/link", json=link_body(raw))
    assert result.status_code == 200, result.text
    assert result.json()["uuid"] == account["uuid"]
    assert owner.cookies.get(owners.COOKIE) != old_session
    assert "HttpOnly" in result.headers["set-cookie"]
    assert owner.post("/owner/telegram/login", json={"init_data": raw}).status_code == 409
    owner.post("/owner/logout")
    # Reordering the consumed data doesn't bypass replay detection, including after logout.
    assert owner.post("/owner/telegram/login", json={"init_data": "&".join(reversed(raw.split("&")))}).status_code == 409
    assert owner.get("/owner/me").status_code == 401
    result = owner.post("/v1/auth/owner/telegram/login", json={"init_data": signed(query_id="reopen", start_param="another-doctor")})
    assert result.status_code == 200, result.text
    assert result.json()["uuid"] == account["uuid"]
    assert owner.get("/patients").status_code == 401
    assert staff.get("/owner/me").status_code == 401
    with factory() as db:
        stored = db.get(OwnerAccount, UUID(account["uuid"]))
        assert stored.doctor_user_id == UUID(user["user_id"])
        assert stored.workspace == workspace
        assert stored.tenant_id == (UUID(user["organization"]["org_id"]) if workspace == "organization" else None)
        assert db.scalar(select(TelegramIdentity)).owner_account_uuid == stored.uuid


def test_unlinked_requires_owner_credentials_and_never_uses_start_param(telegram):
    staff, owner, factory, _ = telegram
    code = staff.get("/join-codes/current").json()["code"]
    assert owner.post("/owner/telegram/login", json={"init_data": signed(start_param=code)}).status_code == 409
    assert owner.post("/owner/telegram/link", json=link_body(signed())).status_code == 401
    for body in [{"telegram_user_id": "1234567890123"}, {"init_data": signed(), "user_id": "123"}]:
        assert owner.post("/owner/telegram/login", json=body).status_code == 422
    invalid = owner.post("/owner/telegram/link", json={"init_data": "raw-signed-secret", "email": "owner@example.com", "password": "secret" * 30})
    assert invalid.status_code == 422 and "raw-signed-secret" not in invalid.text and "secretsecret" not in invalid.text
    with factory() as db:
        assert db.scalar(select(OwnerAccount)) is None
        assert db.scalar(select(TelegramIdentity)) is None
        assert db.scalar(select(TelegramExchange)) is None


def test_conflicts_and_cross_owner_clinical_isolation(telegram):
    staff, owner, factory, user = telegram
    code = staff.get("/join-codes/current").json()["code"]
    first = register(owner, code).json()
    animal = owner.post("/owner/animals", json={"name": "Private", "species": "cat"}).json()
    registration = staff.get("/owner-registrations").json()[0]["uuid"]
    assert staff.post(f"/owner-registrations/{registration}/accept", json={"mode": "create"}).status_code == 200
    # Exercise an actual clinical Patient after staff acceptance, not just a draft passport.
    animal = owner.get("/owner/animals").json()[0]
    assert owner.post("/owner/telegram/link", json=link_body(signed(query_id="first"))).status_code == 200
    owner.post("/owner/logout")
    # A second doctor and a second owner must never inherit the first owner's data.
    user["user_id"] = str(uuid4())
    code2 = staff.get("/join-codes/current").json()["code"]
    second = register(owner, code2, "second@example.com").json()
    assert owner.post("/owner/telegram/link", json=link_body(signed(query_id="conflict"), "second@example.com")).status_code == 409
    assert owner.post("/owner/telegram/link", json=link_body(signed(user=999, query_id="wrong-session"))).status_code == 409
    assert owner.post("/owner/telegram/login", json={"init_data": signed(query_id="session-conflict")}).status_code == 409
    assert owner.post("/owner/telegram/link", json=link_body(signed(user=999, query_id="second"), "second@example.com")).status_code == 200
    owner.post("/owner/logout")
    assert owner.post("/owner/telegram/login", json={"init_data": signed(user=999, query_id="second-login")}).json()["uuid"] == second["uuid"]
    assert owner.get("/owner/animals").json() == []
    assert owner.patch(f"/owner/animals/{animal['uuid']}", json={"name": "stolen"}).status_code == 404
    assert owner.get(f"/owner/animals/{animal['uuid']}/messages").status_code == 404
    assert owner.get(f"/owner/animals/{animal['uuid']}/visits").status_code == 404
    assert owner.get(f"/owner/animals/{animal['uuid']}/files").status_code == 404
    owner.post("/owner/logout")
    assert owner.post("/owner/telegram/login", json={"init_data": signed(query_id="first-login")}).json()["uuid"] == first["uuid"]
    assert owner.get("/owner/animals").json()[0]["name"] == "Private"


def test_api_rejects_forgery_expiry_csrf_and_disables_when_unconfigured(telegram, monkeypatch):
    _, owner, _, _ = telegram
    for raw in [signed(age=301), signed().replace("1234567890123", "1234567890124")]:
        response = owner.post("/owner/telegram/login", json={"init_data": raw})
        assert response.status_code == 401 and "set-cookie" not in response.headers
    assert owner.post("/owner/telegram/login", json={"init_data": signed()}, headers={"Origin": "https://evil.example"}).status_code == 403
    monkeypatch.setattr(owners, "get_settings", lambda: Settings(DATABASE_URL="sqlite://", TELEGRAM_BOT_TOKEN=None))
    assert owner.post("/owner/telegram/login", json={"init_data": signed()}).status_code == 503
