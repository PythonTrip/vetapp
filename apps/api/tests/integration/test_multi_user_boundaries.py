"""PostgreSQL checks for tenant boundaries and cross-request refresh serialization."""
import hashlib
import time
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

pytestmark = pytest.mark.integration


def test_tenant_boundaries_and_parallel_refresh(api_app, monkeypatch):
    from vetdietderm_api import auth
    from vetdietderm_api.db import get_session_factory

    tenant_a, tenant_b, user_a, user_b = (str(uuid4()) for _ in range(4))
    profiles = {
        'a': {'user_id': user_a, 'email': 'a@example.com', 'email_verified': True,
              'account_status': 'active', 'role': 'member',
              'organization': {'org_id': tenant_a, 'name': 'A', 'status': 'active', 'org_role': 'owner'}},
        'b': {'user_id': user_b, 'email': 'b@example.com', 'email_verified': True,
              'account_status': 'active', 'role': 'member',
              'organization': {'org_id': tenant_b, 'name': 'B', 'status': 'active', 'org_role': 'owner'}},
    }
    refresh_calls = []
    def remote(method, path, body=None, token=None):
        if path == '/auth/refresh':
            refresh_calls.append(body['refresh_token'])
            assert body['refresh_token'] == 'refresh-a'
            time.sleep(0.1)
            return httpx.Response(200, json={'access_token': 'a-new', 'refresh_token': 'successor-a',
                'expires_in': 900, 'refresh_token_expires_in': 3600})
        assert path == '/me'
        return httpx.Response(200, json=profiles['a' if token in {'a', 'a-new'} else 'b'])
    monkeypatch.setattr(auth, 'upstream', remote)
    with get_session_factory()() as db:
        for key in ('a', 'b'):
            db.add(auth.BrowserSession(key_hash=hashlib.sha256(key.encode()).hexdigest(),
                access_token=key, refresh_token=f'refresh-{key}', access_expires=time.time()+900,
                expires=time.time()+3600))
        db.commit()
    with TestClient(api_app, cookies={'vetapp_session': 'a'}, headers={'X-Vetapp-CSRF': '1', 'X-Vetapp-Workspace': 'organization'}) as a, \
         TestClient(api_app, cookies={'vetapp_session': 'b'}, headers={'X-Vetapp-CSRF': '1', 'X-Vetapp-Workspace': 'organization'}) as b:
        created = a.post('/clients', json={'name': 'Private client A'})
        assert created.status_code == 201, created.text
        client_id = created.json()['uuid']
        assert b.get('/clients').json() == []
        assert b.get(f'/clients/{client_id}').status_code == 404
        assert b.patch(f'/clients/{client_id}', json={'name': 'Intrusion'}).status_code == 404
        assert a.get(f'/clients/{client_id}').json()['name'] == 'Private client A'
        profiles['a']['organization']['org_role'] = 'viewer'
        assert a.post('/clients', json={'name': 'Forbidden'}).status_code == 403
        assert a.get(f'/clients/{client_id}').status_code == 200
        with get_session_factory()() as db:
            row = db.scalar(select(auth.BrowserSession).where(
                auth.BrowserSession.key_hash == hashlib.sha256(b'a').hexdigest()))
            row.access_expires = 0
            db.commit()
        def request(_):
            with TestClient(api_app, cookies={'vetapp_session': 'a'}) as client:
                return client.get('/auth-service/me').status_code
        with ThreadPoolExecutor(max_workers=4) as pool:
            assert list(pool.map(request, range(4))) == [200] * 4
        assert refresh_calls == ['refresh-a']
        with get_session_factory()() as db:
            row = db.scalar(select(auth.BrowserSession).where(
                auth.BrowserSession.key_hash == hashlib.sha256(b'a').hexdigest()))
            assert row.refresh_token == 'successor-a'

        # Even a viewer can keep working independently in their personal workspace.
        own = a.post('/clients', json={'name': 'Personal A'}, headers={'X-Vetapp-Workspace': 'personal'})
        assert own.status_code == 201
        personal_id = own.json()['uuid']
        assert b.get(f'/clients/{personal_id}', headers={'X-Vetapp-Workspace': 'personal'}).status_code == 404
        assert a.get(f'/clients/{personal_id}').status_code == 404
        profiles['a']['organization'] = None
        assert a.get(f'/clients/{personal_id}', headers={'X-Vetapp-Workspace': 'personal'}).status_code == 200
        assert a.patch(f'/clients/{personal_id}', json={'name': 'Personal updated'},
                       headers={'X-Vetapp-Workspace': 'personal'}).status_code == 200
