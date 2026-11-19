"""Synthetic module-auth responses for the PostgreSQL and Compose checks."""

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


CLINIC_ID = "00000000-0000-0000-0000-000000000022"
STAFF_IDS = {
    "owner@example.test": "00000000-0000-0000-0000-000000000020",
    "editor@example.test": "00000000-0000-0000-0000-000000000021",
}
STAFF_PASSWORD = "synthetic staff password"
CSRF = {"X-Vetapp-CSRF": "1", "X-Vetapp-Workspace": "organization"}


def response_for(method, path, body=None, token=None):
    if method == "POST" and path == "/auth/login":
        if body["email"] in STAFF_IDS and body["password"] == STAFF_PASSWORD:
            return 200, {
                "access_token": body["email"],
                "refresh_token": "synthetic-refresh",
                "expires_in": 3600,
                "refresh_token_expires_in": 7200,
            }
        return 401, {"detail": "Unknown test account"}
    if token not in STAFF_IDS:
        return 401, {"detail": "Unknown test token"}
    if method == "GET" and path == "/me":
        return 200, {
            "user_id": STAFF_IDS[token],
            "email": token,
            "email_verified": True,
            "account_status": "active",
            "role": "super_admin",
            "organization": {
                "org_id": CLINIC_ID,
                "name": "PostgreSQL QA Clinic",
                "status": "active",
                "org_role": "owner" if token == "owner@example.test" else "member",
            },
        }
    if method == "GET" and path == f"/organizations/{CLINIC_ID}/members":
        return 200, {
            "members": [
                {"user_id": STAFF_IDS["owner@example.test"], "org_role": "owner"},
                {"user_id": STAFF_IDS["editor@example.test"], "org_role": "member"},
            ]
        }
    return 404, {"detail": "Unexpected module-auth call"}


def sign_in_staff(client, email="owner@example.test", *, prefix=""):
    reply = client.post(
        f"{prefix}/auth-service/auth/login",
        json={
            "email": email,
            "password": STAFF_PASSWORD,
        },
    )
    assert reply.status_code == 200, reply.text
    assert client.cookies.get("vetapp_session")


class AuthHandler(BaseHTTPRequestHandler):
    def respond(self):
        size = int(self.headers.get("Content-Length", "0"))
        body = json.loads(self.rfile.read(size)) if size else None
        token = self.headers.get("Authorization", "").removeprefix("Bearer ")
        code, payload = response_for(self.command, self.path, body, token)
        content = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    do_GET = respond
    do_POST = respond


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 8080), AuthHandler).serve_forever()
