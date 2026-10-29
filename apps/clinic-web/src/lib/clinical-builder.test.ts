import { describe, expect, it } from "vitest";

import {
  adaptClinicalDocument,
  createClinicalDocument,
  defaultTemplate,
  generateClinicalText,
  sectionCompletion,
  SYSTEM_CLINICAL_CATALOG,
} from "@/lib/clinical-builder";

describe("clinical builder domain", () => {
  it("generates readable text from structured anamnesis values", () => {
    const document = createClinicalDocument(defaultTemplate("general", "anamnesis"));
    document.values = [
      { fieldId: "field.animal_contact", type: "single_select", value: "yes" },
      { fieldId: "field.housing", type: "single_select", value: "apartment" },
      { fieldId: "field.vaccination", type: "single_select", value: "current" },
      { fieldId: "field.appetite", type: "single_select", value: "normal" },
    ];

    expect(generateClinicalText(document, SYSTEM_CLINICAL_CATALOG)).toContain(
      "Животное содержится в квартире. Имеется контакт с другими животными.",
    );
    expect(generateClinicalText(document, SYSTEM_CLINICAL_CATALOG)).toContain(
      "Вакцинация актуальна.",
    );
    expect(generateClinicalText(document, SYSTEM_CLINICAL_CATALOG)).toContain(
      "Аппетит сохранён.",
    );
  });

  it("keeps legacy text while creating a structured document", () => {
    const document = adaptClinicalDocument(null, "exam", "general", "Старый текст осмотра");

    expect(document.finalText).toBe("Старый текст осмотра");
    expect(document.textEdited).toBe(true);
    expect(document.sectionIds.length).toBeGreaterThan(0);
  });

  it("treats a normal system answer as a complete compact section", () => {
    const document = createClinicalDocument(defaultTemplate("general", "exam"));
    document.values = [
      { fieldId: "field.cardiovascular_status", type: "single_select", value: "normal" },
    ];
    const section = SYSTEM_CLINICAL_CATALOG.sections.find(
      (item) => item.id === "section.cardiovascular",
    );

    expect(section).toBeDefined();
    expect(sectionCompletion(document, section!)).toEqual({ filled: 1, total: 1 });
  });

  it("never serializes stale system details after the section is marked normal", () => {
    const document = createClinicalDocument(defaultTemplate("general", "exam"));
    document.values = [
      { fieldId: "field.cardiovascular_status", type: "single_select", value: "normal" },
      { fieldId: "field.cardiovascular_changes", type: "text", value: "выраженная тахикардия" },
      { fieldId: "field.heart_rate", type: "number", value: 210 },
    ];

    const text = generateClinicalText(document, SYSTEM_CLINICAL_CATALOG);
    expect(text).toContain("Сердечно-сосудистая система: без особенностей.");
    expect(text).not.toContain("тахикардия");
    expect(text).not.toContain("210");
  });

  it("never serializes a clarification whose triggering choice is inactive", () => {
    const document = createClinicalDocument(defaultTemplate("general", "anamnesis"));
    document.values = [
      { fieldId: "field.vomiting", type: "single_select", value: "no", note: "3 раза, 2 дня" },
    ];

    const text = generateClinicalText(document, SYSTEM_CLINICAL_CATALOG);
    expect(text).toContain("Рвоты нет.");
    expect(text).not.toContain("3 раза");
  });
});
