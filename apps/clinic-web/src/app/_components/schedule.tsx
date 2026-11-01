"use client";
import { useQuery } from "@tanstack/react-query";
import { ScheduleBoard } from "@/features/appointments/components/schedule-board";
import { VisitRequestQueue } from "@/features/owner-cabinet/components/visit-request-queue";
import { visitRequestsApi } from "@/features/owner-cabinet/api";

export function ScheduleWorkspace() {
  const requests = useQuery({ queryKey: ["visit-requests"], queryFn: visitRequestsApi.list, refetchInterval: 30_000 });
  return <ScheduleBoard requestCount={requests.data?.filter(row => row.status === "requested").length} queue={<VisitRequestQueue inline />} />;
}
