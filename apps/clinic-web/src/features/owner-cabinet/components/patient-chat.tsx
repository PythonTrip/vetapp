"use client";

import { useAuth } from "@/features/authentication/auth-provider";
import { AnimalChat } from "@/features/owner-cabinet/components/animal-chat";

export function PatientChat({ patientId }: { patientId: string }) {
  const { user, workspace } = useAuth();
  const canReply = Boolean(user) && (workspace === "personal" || ["owner", "admin", "member"].includes(user?.organization?.org_role ?? ""));
  return <AnimalChat key={`${workspace}-${patientId}`} path={`/patients/${patientId}/chat`} canReply={canReply} />;
}
