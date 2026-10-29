"""Chat contract checks with real owner/staff cookies and isolated persistence."""
from uuid import UUID, uuid4

import pytest
from sqlalchemy import func, select

from tests.test_owner_cabinet import cabinet, pending_registration, register  # noqa: F401
from vetdietderm_api.chat.models import ChatMessage, ChatThread
from vetdietderm_api.communications.models import Communication


def paths(registration, animal):
    return (f"/owner/animals/{animal['uuid']}/chat",
            f"/owner-registrations/{registration}/animals/{animal['uuid']}/chat")


@pytest.mark.parametrize("workspace", ["personal", "organization"])
def test_chat_survives_acceptance_and_never_creates_log_rows(cabinet, workspace):
    staff, owner, factory, user = cabinet
    registration, animals = pending_registration(staff, owner, workspace)
    owner_path, registration_path = paths(registration, animals[0])
    headers = {"X-Vetapp-Workspace": workspace}
    assert owner.get(owner_path).json() == []
    with factory() as db:
        assert db.scalar(select(func.count()).select_from(ChatThread)) == 0
    first = owner.post(owner_path, json={"body": "  Вопрос\nо питомце  "})
    assert first.status_code == 201, first.text
    assert first.json()["body"] == "Вопрос\nо питомце"
    assert staff.get(registration_path, headers=headers).json()[0]["author_label"] == "Владелец"
    reply = staff.post(registration_path, headers=headers, json={"body": "Ответ"})
    assert reply.status_code == 201, reply.text
    before = owner.get(owner_path).json()
    assert before[1]["author_label"] == "Доктор Иванова"
    with factory() as db:
        thread_id = db.scalar(select(ChatThread.uuid))
    assert staff.post(f"/owner-registrations/{registration}/accept", json={"mode": "create"}).status_code == 200
    patient = owner.get("/owner/animals").json()[0]
    patient_path = f"/patients/{patient['uuid']}/chat"
    assert owner.get(f"/owner/animals/{patient['uuid']}/chat").json() == before
    assert [m["uuid"] for m in staff.get(patient_path, headers=headers).json()] == [m["uuid"] for m in before]
    assert staff.get(registration_path, headers=headers).json() == staff.get(patient_path, headers=headers).json()
    user["display_name"] = "Изменённый профиль"
    assert staff.get(patient_path, headers=headers).json()[1]["author_label"] == "Доктор Иванова"
    added = owner.post("/owner/animals", json={"name": "Новый", "species": "dog"}).json()
    new_path = f"/owner/animals/{added['uuid']}/chat"
    assert owner.get(new_path).json() == []
    assert owner.post(new_path, json={"body": "Отдельная ветка"}).status_code == 201
    assert owner.get(f"/owner/animals/{patient['uuid']}/chat").json() == before
    with factory() as db:
        assert db.get(ChatThread, thread_id).patient_uuid == UUID(patient["uuid"])
        assert db.scalar(select(func.count()).select_from(ChatThread)) == 2
        assert db.scalar(select(func.count()).select_from(Communication)) == 0


def test_org_observer_and_member_labels_before_and_after_acceptance(cabinet):
    staff, owner, _, user = cabinet
    registration, animals = pending_registration(staff, owner, "organization")
    owner_path, registration_path = paths(registration, animals[0])
    headers = {"X-Vetapp-Workspace": "organization"}
    assert owner.post(owner_path, json={"body": "Вопрос"}).status_code == 201
    user["user_id"] = str(uuid4())
    user["display_name"] = "Другой сотрудник"
    user["organization"]["org_role"] = "observer"
    assert staff.get(registration_path, headers=headers).status_code == 200
    for workspace in ("personal", "organization"):
        result = staff.post(registration_path, headers={"X-Vetapp-Workspace": workspace}, json={"body": "Нет"})
        assert result.status_code == 403
        assert result.json()["detail"] == "Роль наблюдателя разрешает только просмотр"
    user["organization"]["org_role"] = "member"
    assert staff.post(registration_path, headers=headers, json={"body": "Ответ сотрудника"}).status_code == 201
    assert owner.get(owner_path).json()[1]["author_label"] == "Доктор Иванова"
    assert staff.get(registration_path, headers=headers).json()[1]["author_label"] == "Другой сотрудник"
    assert staff.post(f"/owner-registrations/{registration}/accept", json={"mode": "create"}).status_code == 200
    animal = owner.get("/owner/animals").json()[0]
    patient_path = f"/patients/{animal['uuid']}/chat"
    user["organization"]["org_role"] = "observer"
    assert staff.get(patient_path, headers=headers).status_code == 200
    assert staff.post(patient_path, headers=headers, json={"body": "Нет"}).status_code == 403
    user["organization"]["org_role"] = "member"
    user["display_name"] = None
    assert staff.post(patient_path, headers=headers, json={"body": "Ответ по почте"}).json()["author_label"] == user["email"]
    assert owner.get(f"/owner/animals/{animal['uuid']}/chat").json()[-1]["author_label"] == "Доктор Иванова"


def test_personal_threads_and_cookie_kinds_are_isolated(cabinet):
    staff, owner, _, user = cabinet
    registration, animals = pending_registration(staff, owner)
    owner_path, registration_path = paths(registration, animals[0])
    assert staff.get(owner_path).status_code == 401
    assert staff.post(owner_path, json={"body": "Нет"}).status_code == 401
    assert owner.get(registration_path).status_code == 401
    assert owner.post(registration_path, json={"body": "Нет"}).status_code == 401
    doctor_id = user["user_id"]
    user["user_id"] = str(uuid4())
    assert staff.get(registration_path).status_code == 403
    assert staff.post(registration_path, json={"body": "Нет"}).status_code == 403
    user["user_id"] = doctor_id
    assert staff.post(f"/owner-registrations/{registration}/accept", json={"mode": "create"}).status_code == 200
    animal = owner.get("/owner/animals").json()[0]
    patient_path = f"/patients/{animal['uuid']}/chat"
    assert owner.get(patient_path).status_code == 401
    assert owner.post(patient_path, json={"body": "Нет"}).status_code == 401
    user["user_id"] = str(uuid4())
    assert staff.get(patient_path).status_code == 404
    assert staff.post(patient_path, json={"body": "Нет"}).status_code == 404
    owner.post("/owner/logout")
    user["user_id"] = doctor_id
    code = staff.get("/join-codes/current").json()["code"]
    assert register(owner, code, "second@example.com").status_code == 201
    for path in (owner_path, f"/owner/animals/{animal['uuid']}/chat"):
        assert owner.get(path).status_code == 404
        assert owner.post(path, json={"body": "Нет"}).status_code == 404


def test_message_validation_and_plain_text(cabinet):
    staff, owner, factory, _ = cabinet
    registration, animals = pending_registration(staff, owner)
    owner_path, registration_path = paths(registration, animals[0])
    for path, client in ((owner_path, owner), (registration_path, staff)):
        for body in ("", " \t\n ", "я" * 4001):
            assert client.post(path, json={"body": body}).status_code == 422
    assert owner.post(owner_path, headers={"X-Vetapp-CSRF": "0"}, json={"body": "Нет"}).status_code == 403
    assert owner.post(owner_path, json={"body": "я" * 4000}).status_code == 201
    text = '<script>alert("x")</script>\nТекст'
    assert owner.post(owner_path, json={"body": text}).json()["body"] == text
    assert owner.get(owner_path).json()[-1]["body"] == text
    for method in ("patch", "delete"):
        assert getattr(owner, method)(owner_path).status_code == 405
    assert owner.get(paths(registration, animals[1])[0]).json() == []
    assert staff.get(f"/owner-registrations/{registration}/animals/{uuid4()}/chat").status_code == 404
    with factory() as db:
        assert db.scalar(select(func.count()).select_from(ChatMessage)) == 2


def test_link_to_existing_patient_preserves_both_histories(cabinet):
    staff, owner, factory, _ = cabinet
    registration, animals = pending_registration(staff, owner)
    client = staff.post("/clients", json={"name": "Существующий"}).json()
    patient = staff.post("/patients", json={"client_uuid": client["uuid"], "name": "Кот", "species": "cat"}).json()
    other = staff.post("/patients", json={"client_uuid": client["uuid"], "name": "Пёс", "species": "dog"}).json()
    patient_path = f"/patients/{patient['uuid']}/chat"
    old = staff.post(patient_path, json={"body": "История пациента"})
    assert old.status_code == 201, old.text
    owner_path, _ = paths(registration, animals[0])
    new = owner.post(owner_path, json={"body": "До сопоставления"})
    with factory() as db:
        pending_id = db.scalar(select(ChatThread.uuid).where(ChatThread.owner_animal_uuid == UUID(animals[0]["uuid"])))
    result = staff.post(f"/owner-registrations/{registration}/accept", json={"mode": "link", "client_uuid": client["uuid"],
        "matches": [{"owner_animal_id": animals[0]["uuid"], "patient_uuid": patient["uuid"]}]})
    assert result.status_code == 200, result.text
    assert [m["uuid"] for m in staff.get(patient_path).json()] == [old.json()["uuid"], new.json()["uuid"]]
    assert len(owner.get(f"/owner/animals/{patient['uuid']}/chat").json()) == 2
    assert owner.get(f"/owner/animals/{other['uuid']}/chat").json() == []
    assert owner.post(f"/owner/animals/{other['uuid']}/chat", json={"body": "Другой пациент"}).status_code == 201
    with factory() as db:
        assert db.get(ChatThread, pending_id).patient_uuid == UUID(patient["uuid"])
