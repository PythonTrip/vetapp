// VetDietDerm shared types

export type Species =
  | "dog" | "cat" | "rabbit" | "ferret" | "rodent" | "bird" | "reptile" | "horse" | "other";
export type Sex = "male" | "female";
export type LifeStage = "puppy_kitten" | "adult" | "senior" | "gestation" | "lactation";
export type ActivityLevel = "low" | "moderate" | "high" | "very_high";
export type ConsultationType = "appointment" | "note" | "diagnostic" | "treatment";
export type ConsultationStatus = "draft" | "in_progress" | "completed" | "cancelled";
export type ConsultationSpecialty = "general" | "dermatology" | "nutrition";
export type DietType = "commercial" | "home_cooked" | "barf" | "mixed";

export interface PetWithRelations {
  id: string;
  name: string;
  species: Species;
  breed: string;
  birthDate: string;
  sex: Sex;
  neutered: boolean;
  ownerName: string;
  ownerContact: string; // combined "email · phone", kept for compatibility/export
  ownerEmail: string | null;
  ownerPhone: string | null;
  currentWeight: number;
  targetWeight: number | null;
  bcs: number;
  lifeStage: LifeStage;
  activityLevel: ActivityLevel;
  allergies: string; // JSON array of strings
  chronicConditions: string; // JSON array of strings
  feeding: string | null; // JSON FeedingInfo
  notes: string | null;
  consultations: Consultation[];
  photos: LesionPhoto[];
  dietPlans: DietPlan[];
  appointments: Appointment[];
}

export interface Appointment {
  id: string;
  petId: string;
  date: string;
  duration: number;
  type: string; // consultation | recheck | procedure | telemedicine
  reason: string;
  status: string; // scheduled | completed | cancelled | no_show
  notes: string | null;
  createdAt: string;
}

export interface AppointmentWithPet extends Appointment {
  pet: {
    id: string;
    name: string;
    species: Species;
    breed: string;
  };
}

export interface CustomTemplate {
  id: string;
  name: string;
  category: string;
  description: string | null;
  icon: string;
  type: ConsultationType;
  chiefComplaint: string | null;
  notes: string;
  suggestedVas: number | null;
  duration: string | null;
  templateKey: string | null;
  version: number;
  isLatest: boolean;
  sections: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CommunicationLogEntry {
  id: string;
  petId: string;
  channel: "phone" | "email" | "text" | "video" | "in_person";
  direction: "inbound" | "outbound";
  date: string;
  duration: number | null;
  subject: string | null;
  notes: string | null;
  followUp: boolean;
  createdAt: string;
}

export interface Consultation {
  id: string;
  petId: string;
  date: string;
  type: ConsultationType;
  chiefComplaint: string | null;
  notes: string;
  transcript: string | null;
  vasScore: number | null;
  weight: number | null;
  dietPlanId: string | null;
  status: ConsultationStatus;
  specialty: ConsultationSpecialty | null;
  anamnesis: string | null;
  anamnesisData: string | null; // JSON AnamnesisData
  physicalExam: string | null;
  diagnoses: string;
  prescriptions: string;
  followUpPlan: string | null;
  followUpDate: string | null;
  templateKey: string | null;
  templateName: string | null;
  templateVersion: number | null;
  completedAt: string | null;
  createdAt?: string;
  updatedAt?: string;
}

// Feeding baseline stored on the pet card, auto-filled into every anamnesis
export interface FeedingInfo {
  foodType: string; // commercial_dry | commercial_wet | mixed | home_cooked | barf | other
  brand: string;
  dailyAmount: string;
  feedingsPerDay: string;
  treats: string;
  supplements: string;
  notes: string;
}

// Structured anamnesis answers persisted per consultation
export interface AnamnesisData {
  specialty: ConsultationSpecialty;
  answers: Record<string, string | string[]>;
  freeText?: string;
}

export interface PrescriptionItem {
  id: string;
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
}

export interface LesionPhoto {
  id: string;
  petId: string;
  consultationId: string | null;
  date: string;
  imageData: string;
  caption: string | null;
  vasScore: number | null;
  bodyRegion: string | null;
}

export interface DietPlan {
  id: string;
  petId: string;
  name: string;
  type: DietType;
  rer: number;
  mer: number;
  macros: string;
  template: string | null;
  notes: string | null;
}

export type DietComponentCategory =
  | "protein" | "organ" | "bone" | "vegetable" | "grain" | "supplement" | "fat" | "commercial";

export interface DietTemplateComponent {
  category: DietComponentCategory;
  ingredient: string;
  grams: number;
  // Optional link to a NutritionProduct from the catalog — enables accurate
  // energy density (ME) and macro math instead of category defaults
  productId?: number | null;
  meKcalPerKg?: number | null;
  proteinPct?: number | null; // as-fed CP %
  fatPct?: number | null; // as-fed CFa %
}

// Parsed note fields from AI
export interface ParsedNoteFields {
  weight: number | null;
  bcs: number | null;
  vasScore: number | null;
  symptoms: string[];
  chiefComplaint: string | null;
  diet: string | null;
  treatment: string | null;
  diagnostics: string[];
  notes: string;
}

export interface RERMERResult {
  rer: number;
  mer: number;
  merFactors: { label: string; value: number }[];
  targetWeight: number | null;
  weightStatus: "underweight" | "ideal" | "overweight" | "obese";
  recommendations: string[];
}

export interface DryMatterResult {
  proteinDM: number;
  fatDM: number;
  fiberDM: number;
  moisture: number;
  dryMatterPct: number;
  carbsDM: number;
  kcalPerKg?: number;
}

export interface Allergen {
  id: string;
  category: "environmental" | "food" | "cross_reactive";
  name: string;
  description: string;
  crossReactive: string[];
  safeAlternatives: string[];
}

export interface EliminationProtocolStep {
  id: string;
  phase: string;
  title: string;
  description: string;
  duration: string;
  completed: boolean;
}

export interface HandoutTemplate {
  id: string;
  title: string;
  description: string;
  icon: string;
}
