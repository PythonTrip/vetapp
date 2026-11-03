import * as React from "react";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { encountersApi, type EncounterRecord, type EncounterWrite } from "./api";
import { useCreateEncounter, useUpdateEncounter } from "./hooks";

afterEach(() => vi.restoreAllMocks());

it.each(["create", "update"] as const)("publishes the %s response to both caches before invalidation", async (operation) => {
  const client = new QueryClient();
  const saved = { uuid: "visit", status: "completed" } as EncounterRecord;
  const other = { uuid: "other", status: "draft" } as EncounterRecord;
  client.setQueryData(["encounters", "patient"], [other, { ...saved, status: "draft" }]);
  client.setQueryData(["encounter", saved.uuid], { ...saved, status: "draft" });
  vi.spyOn(encountersApi, "create").mockResolvedValue(saved);
  vi.spyOn(encountersApi, "update").mockResolvedValue(saved);
  const invalidate = vi.spyOn(client, "invalidateQueries").mockImplementation(async () => {
    expect(client.getQueryData(["encounter", saved.uuid])).toEqual(saved);
    expect(client.getQueryData(["encounters", "patient"])).toEqual([other, saved]);
  });
  const { result } = renderHook(() => ({
    create: useCreateEncounter("patient"),
    update: useUpdateEncounter("patient"),
  }), { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
  await act(async () => {
    if (operation === "create") await result.current.create.mutateAsync({ status: "completed" } as EncounterWrite);
    else await result.current.update.mutateAsync({ id: saved.uuid, body: { status: "completed" } });
  });
  expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
    ["encounters", "patient"], ["encounter", saved.uuid], ["appointments"],
  ]);
  client.clear();
});
