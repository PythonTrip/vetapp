import * as React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ClinicalFormBuilder } from "./clinical-form-builder";
import { createClinicalDocument, defaultTemplate, SYSTEM_CLINICAL_CATALOG, type ClinicalDocument } from "@/lib/clinical-builder";

vi.mock("@/lib/hooks", () => ({
  useCreateClinicalCatalogItem: () => ({}),
  useCreateEncounterTemplate: () => ({}),
  useDeleteClinicalCatalogItem: () => ({}),
  useDeleteEncounterTemplate: () => ({}),
}));

function setup(kind: "anamnesis" | "exam", customize?: (value: ClinicalDocument) => ClinicalDocument) {
  let latest = createClinicalDocument(defaultTemplate("general", kind));
  if (customize) latest = customize(latest);
  const changed = vi.fn();
  function Harness() {
    const [value, setValue] = React.useState(latest);
    return <ClinicalFormBuilder kind={kind} specialty="general" value={value} catalog={SYSTEM_CLINICAL_CATALOG} doctorName="" onChange={(next) => { latest = next; changed(next); setValue(next); }} />;
  }
  render(<Harness />);
  return { changed, value: () => latest };
}

describe("ClinicalFormBuilder workflow", () => {
  it("focuses an existing field in a closed section without changing the document", () => {
    const { changed } = setup("anamnesis");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Пункты" }), { button: 0, ctrlKey: false });
    const link = screen.getAllByRole("button", { name: "Перейти к пункту «Вакцинация»" })[0];
    fireEvent.click(link);
    expect(screen.getByRole("radiogroup", { name: "Вакцинация" })).toContainElement(document.activeElement as HTMLElement);
    expect(changed).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Переместить/ })).not.toBeInTheDocument();
  });

  it("marks supported systems normal, removes stale findings and allows editing a collapsed field", () => {
    const state = setup("exam", (value) => ({ ...value, values: [
      { fieldId: "field.mucosa_status", type: "single_select", value: "changes" },
      { fieldId: "field.mucosa_changes", type: "multi_select", value: ["old"], note: "old finding" },
      { fieldId: "field.temperature", type: "number", value: 38.5 },
    ] }));
    fireEvent.click(screen.getByRole("button", { name: "Отметить всё без особенностей" }));
    expect(state.value().values.find((item) => item.fieldId === "field.mucosa_status")?.value).toBe("normal");
    expect(state.value().values.some((item) => item.fieldId === "field.mucosa_changes")).toBe(false);
    expect(state.value().values.find((item) => item.fieldId === "field.temperature")?.value).toBe(38.5);
    expect(state.value().finalText).toContain("без особенностей");
    const heading = screen.getByRole("button", { name: "Слизистые" });
    expect(heading).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(heading);
    const changes = screen.getByRole("group", { name: "Изменения" });
    fireEvent.click(within(changes).getAllByRole("button")[0]);
    expect(state.value().values.find((item) => item.fieldId === "field.mucosa_status")?.value).toBe("changes");
    expect(state.value().values.find((item) => item.fieldId === "field.mucosa_changes")?.value).toHaveLength(1);
  });

  it("keeps special answers neutral and exposes multi-select guidance", () => {
    setup("anamnesis");
    const unknown = screen.getByRole("radio", { name: "Неизвестно" });
    fireEvent.click(unknown);
    expect(unknown).toHaveAttribute("aria-checked", "true");
    expect(unknown).not.toHaveClass("bg-primary");
    expect(screen.getAllByText("Можно выбрать несколько").length).toBeGreaterThan(0);
  });
});
