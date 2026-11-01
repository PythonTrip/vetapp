import { describe, expect, it } from "vitest";
import { consultationState } from "@vetdietderm/owner-features/domain";

describe("consultation lifecycle presentation", () => {
  const now = Date.parse("2026-11-01T10:00:00Z");
  it("uses time only for an upcoming reminder and never assumes a consultation started", () => {
    expect(consultationState("scheduled", "2026-11-01T10:15:00Z", null, now).label).toBe("Скоро начнётся");
    expect(consultationState("scheduled", "2026-11-01T09:00:00Z", null, now).label).toBe("Подтверждён");
    expect(consultationState("requested", "2026-11-01T10:15:00Z", null, now).label).toBe("Ожидает подтверждения");
  });
  it("uses actual encounter progress and gives cancellation precedence over old encounter state", () => {
    expect(consultationState("scheduled", null, "in_progress", now).label).toBe("Идёт консультация");
    expect(consultationState("scheduled", null, "completed", now).label).toBe("Завершён");
    expect(consultationState("cancelled", null, "completed", now).label).toBe("Отменён");
    expect(consultationState("completed", null, "in_progress", now).label).toBe("Завершён");
  });
});
