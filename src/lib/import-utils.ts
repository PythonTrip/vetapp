// VetDietDerm — CSV import utilities for bulk patient creation

export interface ParsedPetRow {
  rowIndex: number;
  // Required
  name: string;
  species: string;
  breed: string;
  birthDate: string; // ISO date
  sex: string;
  ownerName: string;
  ownerContact: string;
  currentWeight: number;
  bcs: number;
  lifeStage: string;
  activityLevel: string;
  // Optional
  neutered?: boolean;
  targetWeight?: number | null;
  notes?: string | null;
  // Validation
  errors: string[];
  warnings: string[];
}

export const IMPORT_TEMPLATE_HEADERS = [
  "Name", "Species", "Breed", "BirthDate", "Sex", "Neutered",
  "OwnerName", "OwnerContact", "CurrentWeight", "TargetWeight", "BCS",
  "LifeStage", "ActivityLevel", "Notes",
];

export const IMPORT_TEMPLATE_ROWS = [
  ["Mochi", "dog", "French Bulldog", "2021-03-15", "female", "yes", "Sarah Chen", "sarah@example.com", "11.2", "10.5", "6", "adult", "moderate", "Atopic dermatitis — currently on elimination diet"],
  ["Luna", "cat", "Domestic Shorthair", "2017-07-22", "female", "yes", "Mark Lee", "mark@example.com", "6.8", "5.0", "8", "adult", "low", "Obese — weight loss plan in progress"],
];

const HEADER_MAP: Record<string, keyof ParsedPetRow> = {
  name: "name",
  species: "species",
  breed: "breed",
  birthdate: "birthDate",
  birth_date: "birthDate",
  dob: "birthDate",
  sex: "sex",
  gender: "sex",
  neutered: "neutered",
  fixed: "neutered",
  spayed: "neutered",
  ownername: "ownerName",
  owner: "ownerName",
  ownercontact: "ownerContact",
  contact: "ownerContact",
  email: "ownerContact",
  currentweight: "currentWeight",
  weight: "currentWeight",
  weight_kg: "currentWeight",
  targetweight: "targetWeight",
  target_weight: "targetWeight",
  bcs: "bcs",
  lifestage: "lifeStage",
  life_stage: "lifeStage",
  activitylevel: "activityLevel",
  activity: "activityLevel",
  notes: "notes",
  note: "notes",
  comment: "notes",
};

// Robust CSV parser that handles quoted fields with commas, quotes (escaped as ""), and newlines
function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        cells.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  cells.push(current);
  return cells.map((c) => c.trim());
}

export function parsePatientCsv(csvText: string): { rows: ParsedPetRow[]; totalRows: number; validRows: number; errorRows: number } {
  // Strip BOM if present
  const text = csvText.replace(/^\uFEFF/, "");
  // Split into lines (handle \r\n and \n)
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return { rows: [], totalRows: 0, validRows: 0, errorRows: 0 };
  }

  const headerCells = parseCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, "_"));
  const columnMap: number[] = []; // index into row cells for each ParsedPetRow field

  for (let col = 0; col < headerCells.length; col++) {
    const headerName = headerCells[col];
    const fieldName = HEADER_MAP[headerName];
    if (fieldName) {
      columnMap[col] = col; // mark as known
    }
  }

  const knownHeaders = headerCells
    .map((h, i) => ({ h, i }))
    .filter(({ h }) => HEADER_MAP[h]);

  const rows: ParsedPetRow[] = [];

  for (let lineIdx = 1; lineIdx < lines.length; lineIdx++) {
    const cells = parseCsvLine(lines[lineIdx]);
    const row: ParsedPetRow = {
      rowIndex: lineIdx + 1,
      name: "",
      species: "",
      breed: "",
      birthDate: "",
      sex: "",
      ownerName: "",
      ownerContact: "",
      currentWeight: 0,
      bcs: 0,
      lifeStage: "",
      activityLevel: "",
      neutered: undefined,
      targetWeight: null,
      notes: null,
      errors: [],
      warnings: [],
    };

    // Map cells via header positions
    for (const { h, i } of knownHeaders) {
      const fieldName = HEADER_MAP[h];
      const value = cells[i] ?? "";
      switch (fieldName) {
        case "name": row.name = value; break;
        case "species": row.species = value.toLowerCase(); break;
        case "breed": row.breed = value; break;
        case "birthDate": row.birthDate = value; break;
        case "sex": row.sex = value.toLowerCase(); break;
        case "neutered": {
          const v = value.toLowerCase();
          row.neutered = ["yes", "true", "1", "y", "neutered", "spayed", "fixed"].includes(v);
          break;
        }
        case "ownerName": row.ownerName = value; break;
        case "ownerContact": row.ownerContact = value; break;
        case "currentWeight": {
          const n = parseFloat(value);
          row.currentWeight = isNaN(n) ? 0 : n;
          break;
        }
        case "targetWeight": {
          if (!value) { row.targetWeight = null; break; }
          const n = parseFloat(value);
          row.targetWeight = isNaN(n) ? null : n;
          break;
        }
        case "bcs": {
          const n = parseInt(value, 10);
          row.bcs = isNaN(n) ? 0 : n;
          break;
        }
        case "lifeStage": {
          // normalize
          const v = value.toLowerCase().trim();
          if (["puppy", "kitten", "puppy/kitten", "puppy_kitten", "young"].includes(v)) row.lifeStage = "puppy_kitten";
          else if (["adult"].includes(v)) row.lifeStage = "adult";
          else if (["senior", "geriatric", "elderly"].includes(v)) row.lifeStage = "senior";
          else if (["gestation", "pregnant", "pregnancy"].includes(v)) row.lifeStage = "gestation";
          else if (["lactation", "nursing"].includes(v)) row.lifeStage = "lactation";
          else row.lifeStage = v;
          break;
        }
        case "activityLevel": {
          const v = value.toLowerCase().trim();
          if (["low", "couch", "couch potato", "sedentary"].includes(v)) row.activityLevel = "low";
          else if (["moderate", "typical", "normal"].includes(v)) row.activityLevel = "moderate";
          else if (["high", "active", "working", "sporting"].includes(v)) row.activityLevel = "high";
          else if (["very high", "very_high", "extreme", "endurance", "sled", "hunting"].includes(v)) row.activityLevel = "very_high";
          else row.activityLevel = v;
          break;
        }
        case "notes": row.notes = value || null; break;
      }
    }

    // Validation
    if (!row.name) row.errors.push("Name is required");
    if (!["dog", "cat"].includes(row.species)) row.errors.push("Species must be 'dog' or 'cat'");
    if (!row.breed) row.errors.push("Breed is required");
    if (!row.birthDate || isNaN(new Date(row.birthDate).getTime())) {
      row.errors.push("BirthDate is required (use YYYY-MM-DD)");
    } else {
      const d = new Date(row.birthDate);
      if (d > new Date()) row.errors.push("BirthDate cannot be in the future");
    }
    if (!["male", "female", "m", "f"].includes(row.sex)) {
      row.errors.push("Sex must be 'male' or 'female'");
    } else {
      row.sex = row.sex.startsWith("m") ? "male" : "female";
    }
    if (!row.ownerName) row.errors.push("OwnerName is required");
    if (!row.ownerContact) row.warnings.push("OwnerContact is empty");
    if (!row.currentWeight || row.currentWeight <= 0) row.errors.push("CurrentWeight must be a positive number");
    if (row.currentWeight > 200) row.warnings.push("CurrentWeight > 200 kg — verify");
    if (!row.bcs || row.bcs < 1 || row.bcs > 9) row.errors.push("BCS must be 1-9");
    if (!row.lifeStage) row.errors.push("LifeStage is required");
    if (!row.activityLevel) row.errors.push("ActivityLevel is required");
    if (row.neutered === undefined) row.neutered = false;

    rows.push(row);
  }

  return {
    rows,
    totalRows: rows.length,
    validRows: rows.filter((r) => r.errors.length === 0).length,
    errorRows: rows.filter((r) => r.errors.length > 0).length,
  };
}

export function downloadImportTemplate() {
  const csv = [IMPORT_TEMPLATE_HEADERS.join(","), ...IMPORT_TEMPLATE_ROWS.map((r) => r.map((c) => {
    if (typeof c === "string" && (c.includes(",") || c.includes('"'))) {
      return `"${c.replace(/"/g, '""')}"`;
    }
    return c;
  }).join(","))].join("\n");

  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "vetdietderm-patient-import-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// Convert parsed row → API payload
export function rowToPetPayload(row: ParsedPetRow) {
  return {
    name: row.name,
    species: row.species,
    breed: row.breed,
    birthDate: new Date(row.birthDate).toISOString(),
    sex: row.sex,
    neutered: !!row.neutered,
    ownerName: row.ownerName,
    ownerContact: row.ownerContact || "",
    currentWeight: row.currentWeight,
    targetWeight: row.targetWeight,
    bcs: row.bcs,
    lifeStage: row.lifeStage,
    activityLevel: row.activityLevel,
    notes: row.notes,
  };
}
