"use client";

import { PatientsWorkspace as PatientWorkspace } from "@/features/patients/components/patients-workspace";
import type { RenderPatientTab } from "@/features/patients/components/patient-detail";
import { RegistrationQueue } from "@/features/owner-cabinet/components/registration-queue";
import { VisitRequestQueue } from "@/features/owner-cabinet/components/visit-request-queue";
import { PatientChat } from "@/features/owner-cabinet/components/patient-chat";
import { EncounterPanel } from "@/features/encounters/components/encounter-panel";
import { DermatologyGallery } from "@/features/encounters/components/dermatology-gallery";
import { CommunicationLog } from "@/features/encounters/components/communication-log";
import { PatientNutrition } from "@/features/nutrition/components/patient-nutrition";

const renderTab: RenderPatientTab = (tab, patient) => {
  switch (tab) {
    case "encounters": return <EncounterPanel patient={patient} />;
    case "gallery": return <DermatologyGallery patientId={patient.uuid} />;
    case "nutrition": return <PatientNutrition patient={patient} />;
    case "comms": return (
      <div className="mx-auto grid w-full max-w-6xl items-start gap-4 xl:grid-cols-2">
        <div className="min-w-0"><CommunicationLog patientId={patient.uuid} /></div>
        <PatientChat patientId={patient.uuid} />
      </div>
    );
  }
};

export function PatientsWorkspace(props: { initialPatientId?: string; initialTab?: string }) {
  return <PatientWorkspace {...props} renderTab={renderTab} queue={<><RegistrationQueue /><VisitRequestQueue /></>} />;
}
