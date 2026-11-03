"""Owner media persistence, access boundaries and chat delivery."""
from uuid import uuid4
from tests.test_owner_cabinet import cabinet, register
from vetdietderm_api.attachments import storage


def setup(owner, staff):
    code = staff.get('/join-codes/current').json()['code']
    assert register(owner, code).status_code == 201
    animal = owner.post('/owner/animals', json={'name': 'Луна', 'species': 'cat'}).json()
    return animal


def test_photos_and_documents_are_private_and_survive_acceptance(cabinet, monkeypatch, tmp_path):
    staff, owner, _, _ = cabinet
    monkeypatch.setattr(storage, 'attachment_root', lambda: tmp_path)
    animal = setup(owner, staff)
    base = f"/owner/animals/{animal['uuid']}/uploads"
    photo = owner.post(base, data={'kind': 'photo'}, files={'file': ('cat.png', b'\x89PNG\r\n\x1a\nimage', 'image/png')})
    assert photo.status_code == 201, photo.text
    photo_id = photo.json()['uuid']
    assert owner.get('/owner/animals').json()[0]['photo_url'] == f'/api/owner/uploads/{photo_id}'
    doc = owner.post(base, data={'kind': 'document'}, files={'file': ('../result.pdf', b'%PDF-1.4 data', 'application/pdf')})
    assert doc.status_code == 201
    assert doc.json()['filename'] == 'result.pdf'
    assert len(owner.get(base).json()) == 1
    assert staff.get(f'/owner/uploads/{photo_id}').status_code == 401
    registration = staff.get('/owner-registrations').json()[0]
    assert staff.post(f"/owner-registrations/{registration['uuid']}/accept", json={'mode': 'create'}).status_code == 200
    accepted = owner.get('/owner/animals').json()[0]
    assert accepted['photo_url'] == f'/api/owner/uploads/{photo_id}'
    assert owner.get(f"/owner/animals/{accepted['uuid']}/uploads").json()[0]['uuid'] == doc.json()['uuid']
    image = owner.get(f'/owner/uploads/{photo_id}')
    assert image.status_code == 200 and image.content.startswith(b'\x89PNG')
    assert image.headers['cache-control'] == 'private, no-store'
    owner.post('/owner/logout')
    assert register(owner, staff.get('/join-codes/current').json()['code'], 'other@example.test').status_code == 201
    assert owner.get(f'/owner/uploads/{photo_id}').status_code == 404
    assert owner.post(base, data={'kind': 'document'}, files={'file': ('a.pdf', b'%PDF-1.4', 'application/pdf')}).status_code == 404


def test_message_attachments_reach_doctor_and_are_scoped_to_thread(cabinet, monkeypatch, tmp_path):
    staff, owner, _, user = cabinet
    monkeypatch.setattr(storage, 'attachment_root', lambda: tmp_path)
    animal = setup(owner, staff)
    other = owner.post('/owner/animals', json={'name': 'Оскар', 'species': 'dog'}).json()
    upload = owner.post(f"/owner/animals/{animal['uuid']}/uploads", data={'kind': 'chat'}, files={'file': ('scan.pdf', b'%PDF-1.4 data', 'application/pdf')}).json()
    assert owner.post(f"/owner/animals/{other['uuid']}/chat", json={'body': 'Неверный питомец', 'attachment_ids': [upload['uuid']]}).status_code == 404
    message = owner.post(f"/owner/animals/{animal['uuid']}/chat", json={'body': 'Анализы', 'attachment_ids': [upload['uuid']]})
    assert message.status_code == 201, message.text
    assert message.json()['attachments'][0]['uuid'] == upload['uuid']
    assert owner.post(f"/owner/animals/{animal['uuid']}/chat", json={'body': 'Повтор', 'attachment_ids': [upload['uuid']]}).status_code == 404
    reg = staff.get('/owner-registrations').json()[0]
    path = f"/owner-registrations/{reg['uuid']}/animals/{animal['uuid']}/chat"
    assert staff.get(path).json()[0]['attachments'][0]['filename'] == 'scan.pdf'
    assert staff.get(f"{path}/files/{upload['uuid']}").content == b'%PDF-1.4 data'
    user['organization'] = {**user['organization'], 'org_id': str(uuid4())}
    assert staff.get(f"{path}/files/{upload['uuid']}", headers={'X-Vetapp-Workspace': 'personal'}).status_code == 403


def test_upload_limits_and_signature_validation(cabinet, monkeypatch, tmp_path):
    staff, owner, _, _ = cabinet
    monkeypatch.setattr(storage, 'attachment_root', lambda: tmp_path)
    animal = setup(owner, staff)
    base = f"/owner/animals/{animal['uuid']}/uploads"
    for content, mime, status in [(b'', 'image/png', 400), (b'<script>bad</script>', 'image/png', 400), (b'file', 'text/html', 400), (b'a' * (8 * 1024 * 1024 + 1), 'image/png', 413)]:
        assert owner.post(base, data={'kind': 'photo'}, files={'file': ('a.png', content, mime)}).status_code == status
    assert not list(tmp_path.iterdir())
