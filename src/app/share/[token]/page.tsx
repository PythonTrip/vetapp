import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { ShareReport } from "@/components/share/share-report";
import type { PetWithRelations } from "@/lib/types";

// Force dynamic rendering — this page is per-token
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ token: string }>;
}

export default async function SharePage({ params }: Props) {
  const { token } = await params;

  const shareToken = await db.shareToken.findUnique({
    where: { token },
    include: {
      pet: {
        include: {
          consultations: { orderBy: { date: "asc" } },
          photos: { orderBy: { date: "asc" } },
          dietPlans: { orderBy: { createdAt: "desc" } },
          appointments: { orderBy: { date: "asc" } },
        },
      },
    },
  });

  if (!shareToken || shareToken.revoked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <div className="text-center max-w-md">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 mx-auto mb-3">
            <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold">Link not available</h1>
          <p className="text-sm text-muted-foreground mt-1">
            This share link is invalid, has been revoked, or no longer exists.
            Please contact your veterinarian for a new link.
          </p>
        </div>
      </div>
    );
  }

  // Check expiry
  if (new Date(shareToken.expiresAt).getTime() < Date.now()) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <div className="text-center max-w-md">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 mx-auto mb-3">
            <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold">Link expired</h1>
          <p className="text-sm text-muted-foreground mt-1">
            This share link expired on {new Date(shareToken.expiresAt).toLocaleDateString()}.
            Please contact your veterinarian for a new link.
          </p>
        </div>
      </div>
    );
  }

  if (!shareToken.pet) {
    notFound();
  }

  // Update view tracking (fire-and-forget)
  db.shareToken.update({
    where: { id: shareToken.id },
    data: {
      viewedAt: new Date(),
      viewCount: { increment: 1 },
    },
  }).catch(() => { /* ignore */ });

  const serializedPet = JSON.parse(JSON.stringify(shareToken.pet)) as PetWithRelations;
  const tokenMeta = {
    id: shareToken.id,
    expiresAt: shareToken.expiresAt.toISOString(),
    viewCount: shareToken.viewCount,
    viewedAt: shareToken.viewedAt?.toISOString() ?? null,
    label: shareToken.label,
  };

  return <ShareReport pet={serializedPet} tokenMeta={tokenMeta} />;
}
