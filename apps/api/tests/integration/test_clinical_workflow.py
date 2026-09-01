from datetime import datetime
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from vetdietderm_api.appointments.schemas import AppointmentRead
from vetdietderm_api.attachments.schemas import AttachmentRead
from vetdietderm_api.communications.schemas import CommunicationRead
from vetdietderm_api.encounters.schemas import EncounterRead
from vetdietderm_api.patients.schemas import ClientRead, PatientRead


pytestmark = pytest.mark.integration
PNG_BYTES = b"\x89PNG\r\n\x1a\nvetapp-integration-test"


def _body(response, expected_status: int):
    assert response.status_code == expected_status, response.text
    return response.json() if response.content else None


def _assert_timezone_aware(value: str) -> None:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    assert parsed.utcoffset() is not None


def test_clinical_records_persist_across_requests_and_attachment_storage(
    api_client: TestClient,
) -> None:
    client = ClientRead.model_validate(
        _body(
            api_client.post(
                "/clients",
                json={
                    "name": "  Ирина Волкова  ",
                    "email": "irina@example.test",
                    "phone": "+7 900 000-00-01",
                },
            ),
            201,
        )
    )
    assert client.name == "Ирина Волкова"
    _assert_timezone_aware(client.created_at.isoformat())

    patient = PatientRead.model_validate(
        _body(
            api_client.post(
                "/patients",
                json={
                    "client_uuid": str(client.uuid),
                    "name": "Бруно",
                    "species": "dog",
                    "breed": "лабрадор",
                    "body_weight_kg": 31.25,
                    "life_stage": "adult",
                    "activity": "low",
                    "neutered": True,
                    "bcs": 6,
                    "allergies": "курица, пшеница",
                    "chronic_conditions": ["атопический дерматит"],
                    "feeding_notes": "  Исключающая диета  ",
                },
            ),
            201,
        )
    )
    assert patient.client_uuid == client.uuid
    assert patient.client.name == client.name
    assert patient.allergies == ["курица", "пшеница"]
    assert patient.feeding_notes == "Исключающая диета"

    persisted_patient = PatientRead.model_validate(
        _body(api_client.get(f"/patients/{patient.uuid}"), 200)
    )
    assert persisted_patient == patient
    patient_search = _body(api_client.get("/patients", params={"q": "Волкова"}), 200)
    assert [row["uuid"] for row in patient_search] == [str(patient.uuid)]

    encounter = EncounterRead.model_validate(
        _body(
            api_client.post(
                f"/patients/{patient.uuid}/encounters",
                json={
                    "specialty": "dermatology",
                    "type": "appointment",
                    "status": "in_progress",
                    "chief_complaint": "Зуд и эритема",
                    "anamnesis_data": {
                        "specialty": "dermatology",
                        "answers": {"seasonality": "круглый год"},
                        "free_text": "Обострение две недели",
                    },
                    "diagnoses": ["  Атопический дерматит  ", ""],
                    "prescriptions": [
                        {
                            "name": "Оклацитиниб",
                            "dosage": "0.5 мг/кг",
                            "frequency": "2 раза/сут",
                            "duration": "14 дней",
                            "instructions": "с кормом",
                        }
                    ],
                    "vas_score": 8,
                    "occurred_at": "2026-09-01T01:30:00Z",
                },
            ),
            201,
        )
    )
    assert encounter.patient_uuid == patient.uuid
    assert encounter.diagnoses == ["Атопический дерматит"]
    assert encounter.anamnesis_data["answers"]["seasonality"] == "круглый год"

    completed_encounter = EncounterRead.model_validate(
        _body(
            api_client.patch(
                f"/encounters/{encounter.uuid}",
                json={"status": "completed", "plan": "  Контроль через 14 дней  ", "vas_score": 4},
            ),
            200,
        )
    )
    assert completed_encounter.status == "completed"
    assert completed_encounter.plan == "Контроль через 14 дней"
    assert completed_encounter.vas_score == 4

    appointment = AppointmentRead.model_validate(
        _body(
            api_client.post(
                "/appointments",
                json={
                    "patient_uuid": str(patient.uuid),
                    "encounter_uuid": str(encounter.uuid),
                    "starts_at": "2026-09-01T01:30:00Z",
                    "duration_min": 45,
                    "visit_type": "recheck",
                    "status": "scheduled",
                    "notes": "Контроль терапии",
                },
            ),
            201,
        )
    )
    assert appointment.patient.uuid == patient.uuid
    assert appointment.encounter_uuid == encounter.uuid
    appointments = _body(
        api_client.get(
            "/appointments",
            params={
                "patientId": str(patient.uuid),
                "from": "2026-09-01T00:00:00Z",
                "to": "2026-09-02T00:00:00Z",
            },
        ),
        200,
    )
    assert [row["uuid"] for row in appointments] == [str(appointment.uuid)]

    communication = CommunicationRead.model_validate(
        _body(
            api_client.post(
                f"/patients/{patient.uuid}/communications",
                json={
                    "channel": "phone",
                    "direction": "outbound",
                    "subject": "Самочувствие после визита",
                    "body": "Зуд уменьшился",
                    "occurred_at": "2026-09-01T03:00:00Z",
                    "follow_up_at": "2026-09-15T03:00:00Z",
                },
            ),
            201,
        )
    )
    assert communication.patient_uuid == patient.uuid
    assert communication.client_uuid == client.uuid
    updated_communication = CommunicationRead.model_validate(
        _body(
            api_client.patch(
                f"/communications/{communication.uuid}",
                json={"channel": "text", "body": "  Зуд уменьшился до VAS 4  "},
            ),
            200,
        )
    )
    assert updated_communication.channel == "text"
    assert updated_communication.body == "Зуд уменьшился до VAS 4"

    other_client = _body(api_client.post("/clients", json={"name": "Другой владелец"}), 201)
    other_patient = _body(
        api_client.post(
            "/patients",
            json={
                "client_uuid": other_client["uuid"],
                "name": "Мия",
                "species": "cat",
            },
        ),
        201,
    )
    other_encounter = _body(
        api_client.post(
            f"/patients/{other_patient['uuid']}/encounters",
            json={"specialty": "general", "type": "note", "status": "draft"},
        ),
        201,
    )

    from vetdietderm_api.settings import get_settings

    attachment_dir = get_settings().ATTACHMENT_DIR
    mismatched = api_client.post(
        f"/patients/{patient.uuid}/attachments",
        data={"encounter_uuid": other_encounter["uuid"]},
        files={"file": ("lesion.png", PNG_BYTES, "image/png")},
    )
    assert mismatched.status_code == 400
    assert mismatched.json() == {"detail": "Приём принадлежит другому пациенту"}
    assert not attachment_dir.exists() or list(attachment_dir.iterdir()) == []

    attachment = AttachmentRead.model_validate(
        _body(
            api_client.post(
                f"/patients/{patient.uuid}/attachments",
                data={
                    "kind": "lesion_photo",
                    "caption": "  Лапа до лечения  ",
                    "body_region": "передняя правая лапа",
                    "vas_score": "4",
                    "encounter_uuid": str(encounter.uuid),
                },
                files={"file": ("lesion.png", PNG_BYTES, "image/png")},
            ),
            201,
        )
    )
    assert attachment.patient_uuid == patient.uuid
    assert attachment.encounter_uuid == encounter.uuid
    assert attachment.caption == "Лапа до лечения"
    assert attachment.byte_size == len(PNG_BYTES)
    stored_files = list(attachment_dir.iterdir())
    assert len(stored_files) == 1
    assert stored_files[0].read_bytes() == PNG_BYTES

    download = api_client.get(f"/attachments/{attachment.uuid}/file")
    assert download.status_code == 200
    assert download.headers["content-type"] == "image/png"
    assert download.content == PNG_BYTES

    updated_attachment = AttachmentRead.model_validate(
        _body(
            api_client.patch(
                f"/attachments/{attachment.uuid}",
                json={"caption": "После 14 дней", "vas_score": 2},
            ),
            200,
        )
    )
    assert updated_attachment.caption == "После 14 дней"
    assert updated_attachment.vas_score == 2

    _body(api_client.delete(f"/attachments/{attachment.uuid}"), 204)
    assert list(attachment_dir.iterdir()) == []
    assert api_client.get(f"/attachments/{attachment.uuid}").status_code == 404

    _body(api_client.delete(f"/communications/{communication.uuid}"), 204)
    _body(api_client.delete(f"/appointments/{appointment.uuid}"), 204)
    _body(api_client.delete(f"/encounters/{encounter.uuid}"), 204)
    assert api_client.get(f"/encounters/{encounter.uuid}").status_code == 404
    assert api_client.get(f"/appointments/{appointment.uuid}").status_code == 404
    assert api_client.patch(f"/communications/{communication.uuid}", json={}).status_code == 404

    invalid_uuid = api_client.get("/encounters/not-a-uuid")
    assert invalid_uuid.status_code == 422
    assert api_client.get(f"/patients/{uuid4()}").status_code == 404
