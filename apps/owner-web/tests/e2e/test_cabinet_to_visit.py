import os
from datetime import datetime, timezone
from urllib.parse import quote, urlsplit
from uuid import uuid4

import pytest
from playwright.sync_api import expect, sync_playwright


@pytest.fixture
def owner_stack():
    origin = os.environ.get("VAT_OWNER_E2E_ORIGIN", "").rstrip("/")
    code = os.environ.get("VAT_OWNER_E2E_CLINIC_CODE")
    clinic_name = os.environ.get("VAT_OWNER_E2E_CLINIC_NAME")
    if not (origin and code and clinic_name):
        pytest.fail("Set VAT_OWNER_E2E_ORIGIN, VAT_OWNER_E2E_CLINIC_CODE and VAT_OWNER_E2E_CLINIC_NAME for the disposable stack.")
    address = urlsplit(origin)
    if (address.scheme != "http" or address.hostname != "127.0.0.1" or not address.port
            or address.username or address.password or address.path or address.query or address.fragment):
        pytest.fail("VAT_OWNER_E2E_ORIGIN must be an HTTP origin on 127.0.0.1 with an explicit port.")
    return origin, code, clinic_name


def test_owner_signs_in_and_request_survives_cabinet_reload(owner_stack):
    origin, code, clinic_name = owner_stack
    email = f"vat-{uuid4().hex}@example.test"
    password = "synthetic visit password"
    problem = "Питомец плохо ест"
    proposed = datetime(2030, 3, 1, 10, tzinfo=timezone.utc)

    with sync_playwright() as playwright:
        seed = playwright.request.new_context(base_url=origin, extra_http_headers={
            "Origin": origin, "X-Vetapp-CSRF": "1",
        }, max_redirects=0)
        try:
            registered = seed.post("/api/owner/register", data={
                "code": code, "email": email, "password": password,
                "name": "Тестовый владелец", "phone": "+70000000000",
            })
            assert registered.status == 201, registered.text()
            pet_ids = {}
            for name in ("Луна", "Оскар"):
                created = seed.post("/api/owner/animals", data={"name": name, "species": "dog"})
                assert created.status == 201, created.text()
                pet_ids[name] = created.json()["uuid"]
            assert seed.post("/api/owner/logout").ok
        finally:
            seed.dispose()

        browser = playwright.chromium.launch()
        try:
            page = browser.new_page(base_url=origin, timezone_id="UTC")
            page.goto(f"/join/{quote(code, safe='')}")
            expect(page.get_by_role("heading", name=clinic_name, exact=True)).to_be_visible()
            page.get_by_role("button", name="Уже есть кабинет? Войти", exact=True).click()
            page.get_by_label("Электронная почта").fill(email)
            page.get_by_label("Пароль", exact=True).fill(password)
            page.get_by_role("button", name="Войти", exact=True).click()
            expect(page).to_have_url(f"{origin}/cabinet")
            expect(page.get_by_role("heading", name="Привет!", exact=True)).to_be_visible()
            expect(page.get_by_text(clinic_name, exact=True).filter(visible=True)).to_be_visible()

            page.get_by_role("button", name="Записаться к врачу").click()
            page.get_by_role("radio", name="Оскар", exact=True).check()
            next_step = page.get_by_role("button", name="Продолжить", exact=True)
            expect(next_step).to_be_disabled()
            page.get_by_label("Опишите проблему *", exact=True).fill(problem)
            next_step.click()
            next_step.click()
            page.get_by_label("Предлагаемые дата и время").fill(proposed.strftime("%Y-%m-%dT%H:%M"))
            next_step.click()
            expect(page.get_by_text(f"Оскар · {problem}", exact=True)).to_be_visible()
            page.get_by_role("button", name="Отправить заявку", exact=True).click()
            expect(page.get_by_role("heading", name="Заявка отправлена", exact=True)).to_be_visible()

            page.goto("/cabinet")
            page.get_by_role("button", name="Оскар", exact=True).click()
            expect(page.get_by_role("heading", name=f"Оскар · {problem}", exact=True)).to_be_visible()
            oscar = page.request.get(f"/api/owner/animals/{pet_ids['Оскар']}/visits")
            assert oscar.ok, oscar.text()
            (visit,) = oscar.json()
            assert visit["owner_animal_uuid"] == pet_ids["Оскар"]
            assert visit["reason"] == problem
            assert datetime.fromisoformat(visit["proposed_starts_at"]) == proposed
            assert visit["status"] == "requested"
            assert visit["confirmed_starts_at"] is None
            assert visit["visit_type"] is None
            luna = page.request.get(f"/api/owner/animals/{pet_ids['Луна']}/visits")
            assert luna.ok and luna.json() == []
        finally:
            browser.close()
