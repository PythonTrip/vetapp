"use client";
import { AnimalChat as Chat } from "@vetdietderm/owner-features/components/animal-chat";
import { staffChatApi } from "../api";
export function AnimalChat({ ownerView = false, ...props }: { path: string; ownerView?: boolean; canReply?: boolean }) {
  return <Chat {...props} ownerView={ownerView} transport={ownerView ? undefined : staffChatApi} />;
}
