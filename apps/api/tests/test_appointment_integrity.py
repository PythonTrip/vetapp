from types import SimpleNamespace
from unittest.mock import Mock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from vetdietderm_api.appointments import repository
from vetdietderm_api.appointments.schemas import AppointmentUpdate


@pytest.mark.parametrize('link_action', ['retain', 'clear', 'replace', 'same_patient'])
def test_patient_reassignment_validates_result_before_mutating(monkeypatch, link_action):
    original_patient, new_patient, encounter_id = uuid4(), uuid4(), uuid4()
    appointment = SimpleNamespace(uuid=uuid4(), patient_uuid=original_patient, encounter_uuid=encounter_id)
    session = Mock()
    monkeypatch.setattr(repository, 'get_appointment', lambda *args: appointment)
    monkeypatch.setattr(repository, 'get_patient', lambda session, patient_id: SimpleNamespace(uuid=patient_id))
    replacement_id = uuid4()
    monkeypatch.setattr(repository, 'get_encounter', lambda session, eid: SimpleNamespace(
        patient_uuid=new_patient if eid == replacement_id else original_patient))
    payload = {'patient_uuid': original_patient if link_action == 'same_patient' else new_patient}
    if link_action == 'clear':
        payload['encounter_uuid'] = None
    if link_action == 'replace':
        payload['encounter_uuid'] = replacement_id
    if link_action == 'retain':
        with pytest.raises(HTTPException) as error:
            repository.update_appointment(session, appointment.uuid, AppointmentUpdate(**payload))
        assert error.value.status_code == 400
        assert appointment.patient_uuid == original_patient
        assert appointment.encounter_uuid == encounter_id
        session.commit.assert_not_called()
    else:
        repository.update_appointment(session, appointment.uuid, AppointmentUpdate(**payload))
        assert appointment.patient_uuid == payload['patient_uuid']
        assert appointment.encounter_uuid == payload.get('encounter_uuid', encounter_id)
        session.commit.assert_called_once()
