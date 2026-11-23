import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { assessmentsApi, type AssessmentRecord, type AssessmentRequestPayload } from "./api";
import { useCreateAssessment } from "./hooks";

vi.mock("./api", () => ({ assessmentsApi: { create: vi.fn() } }));

it("discards a result from before the clinician edited the ration", async () => {
  let finish!: (result: AssessmentRecord) => void;
  const oldResponse = new Promise<AssessmentRecord>((resolve) => { finish = resolve; });
  vi.mocked(assessmentsApi.create).mockReturnValueOnce(oldResponse);
  const { result } = renderHook(useCreateAssessment);
  const initial: AssessmentRequestPayload = {
    animal: { species: "dog" },
    profile_mode: "manual",
    components: [{ food_uuid: "food-id", grams: 100 }],
  };

  let pending!: Promise<AssessmentRecord | null>;
  act(() => { pending = result.current.mutateAsync(initial); });
  expect(result.current.isPending).toBe(true);
  act(() => result.current.reset());
  await act(async () => {
    finish({ engine_id: "old" } as AssessmentRecord);
    await expect(pending).resolves.toBeNull();
  });
  expect(result.current.data).toBeNull();
  expect(result.current.isPending).toBe(false);
});
