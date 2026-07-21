"use client";

import * as React from "react";
import {
  Share2, Link2, Copy, Trash2, Eye, Clock, Plus, Check, Loader2, ExternalLink,
  ShieldAlert, ShieldCheck, Calendar, X, QrCode,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  useShareTokens, useCreateShareToken, useRevokeShareToken, useDeleteShareToken,
  type ShareTokenInfo,
} from "@/lib/hooks";
import type { PetWithRelations } from "@/lib/types";
import { toast } from "sonner";

interface OwnerPortalDialogProps {
  pet: PetWithRelations | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const EXPIRY_OPTIONS = [
  { value: "7", label: "7 days" },
  { value: "14", label: "14 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
];

export function OwnerPortalDialog({ pet, open, onOpenChange }: OwnerPortalDialogProps) {
  const { data: tokens, isLoading } = useShareTokens(pet?.id ?? null);
  const createMut = useCreateShareToken();
  const revokeMut = useRevokeShareToken();
  const deleteMut = useDeleteShareToken();

  const [expiryDays, setExpiryDays] = React.useState("30");
  const [label, setLabel] = React.useState("");
  const [copiedToken, setCopiedToken] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setExpiryDays("30");
      setLabel("");
      setCopiedToken(null);
    }
  }, [open]);

  function buildShareUrl(token: string): string {
    if (typeof window === "undefined") return `/share/${token}`;
    return `${window.location.origin}/share/${token}`;
  }

  async function handleCreate() {
    if (!pet) return;
    try {
      const t = await createMut.mutateAsync({
        petId: pet.id,
        expiresInDays: Number(expiryDays),
        label: label.trim() || undefined,
      });
      toast.success("Share link created", {
        description: `Valid for ${expiryDays} days. Copy and send to ${pet.ownerName || "owner"}.`,
      });
      // Auto-copy
      await navigator.clipboard?.writeText(buildShareUrl(t.token));
      setCopiedToken(t.token);
      setLabel("");
    } catch {
      toast.error("Failed to create share link");
    }
  }

  async function copyLink(token: string) {
    try {
      await navigator.clipboard?.writeText(buildShareUrl(token));
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 2000);
      toast.success("Link copied to clipboard");
    } catch {
      toast.error("Failed to copy");
    }
  }

  function handleRevoke(t: ShareTokenInfo) {
    revokeMut.mutate(
      { id: t.id, petId: t.petId },
      {
        onSuccess: () => toast.success("Link revoked", { description: "Owner will no longer be able to access." }),
        onError: () => toast.error("Failed to revoke"),
      },
    );
  }

  function handleDelete(t: ShareTokenInfo) {
    deleteMut.mutate(
      { id: t.id, petId: t.petId },
      {
        onSuccess: () => toast.success("Link deleted"),
        onError: () => toast.error("Failed to delete"),
      },
    );
  }

  if (!pet) return null;

  const activeTokens = (tokens ?? []).filter((t) => !t.revoked && new Date(t.expiresAt).getTime() > Date.now());
  const expiredTokens = (tokens ?? []).filter((t) => !t.revoked && new Date(t.expiresAt).getTime() <= Date.now());
  const revokedTokens = (tokens ?? []).filter((t) => t.revoked);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Share2 className="h-4 w-4" />
            </div>
            Owner Portal — Share Report
          </DialogTitle>
          <DialogDescription className="text-xs">
            Generate a secure, expiring link for {pet.ownerName || "the owner"} to view {pet.name}'s consultation report online. No login required.
          </DialogDescription>
        </DialogHeader>

        {/* Create new token */}
        <div className="rounded-xl border bg-muted/30 p-3 space-y-2">
          <div className="text-xs font-semibold flex items-center gap-1.5">
            <Plus className="h-3.5 w-3.5 text-primary" /> Create New Share Link
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Label (optional)</Label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Emailed to owner"
                className="h-8 text-xs"
              />
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Expires in</Label>
              <Select value={expiryDays} onValueChange={setExpiryDays}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EXPIRY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button size="sm" className="w-full gap-1.5" onClick={handleCreate} disabled={createMut.isPending}>
            {createMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Generate & Copy Link
          </Button>
        </div>

        {/* Token list */}
        <ScrollArea className="flex-1 max-h-[40vh] scrollbar-thin">
          <div className="space-y-2 pr-2">
            {isLoading ? (
              [0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)
            ) : (tokens ?? []).length === 0 ? (
              <div className="text-center py-8">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted/60 mx-auto mb-2">
                  <Link2 className="h-6 w-6 text-muted-foreground/50" />
                </div>
                <p className="text-sm font-medium">No share links yet</p>
                <p className="text-xs text-muted-foreground mt-1">Create a link above to share {pet.name}'s report.</p>
              </div>
            ) : (
              <>
                {activeTokens.length > 0 && (
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-1.5 flex items-center gap-1">
                      <ShieldCheck className="h-3 w-3" /> Active ({activeTokens.length})
                    </div>
                    <div className="space-y-1.5">
                      {activeTokens.map((t) => (
                        <TokenCard
                          key={t.id}
                          token={t}
                          petName={pet.name}
                          copied={copiedToken === t.token}
                          onCopy={() => copyLink(t.token)}
                          onRevoke={() => handleRevoke(t)}
                          onDelete={() => handleDelete(t)}
                          buildUrl={buildShareUrl}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {expiredTokens.length > 0 && (
                  <div className="pt-2">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-1.5 flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Expired ({expiredTokens.length})
                    </div>
                    <div className="space-y-1.5">
                      {expiredTokens.map((t) => (
                        <TokenCard
                          key={t.id}
                          token={t}
                          petName={pet.name}
                          copied={copiedToken === t.token}
                          onCopy={() => copyLink(t.token)}
                          onRevoke={() => handleRevoke(t)}
                          onDelete={() => handleDelete(t)}
                          buildUrl={buildShareUrl}
                          expired
                        />
                      ))}
                    </div>
                  </div>
                )}
                {revokedTokens.length > 0 && (
                  <div className="pt-2">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400 mb-1.5 flex items-center gap-1">
                      <ShieldAlert className="h-3 w-3" /> Revoked ({revokedTokens.length})
                    </div>
                    <div className="space-y-1.5">
                      {revokedTokens.map((t) => (
                        <TokenCard
                          key={t.id}
                          token={t}
                          petName={pet.name}
                          copied={false}
                          onCopy={() => {}}
                          onRevoke={() => {}}
                          onDelete={() => handleDelete(t)}
                          buildUrl={buildShareUrl}
                          revoked
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>

        <Separator />
        <DialogFooter className="flex-row items-center justify-between gap-2">
          <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
            <ShieldCheck className="h-3 w-3 text-emerald-500" />
            Links are read-only and expire automatically.
          </div>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="gap-1">
            <X className="h-3.5 w-3.5" /> Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TokenCard({
  token, petName, copied, onCopy, onRevoke, onDelete, buildUrl, expired, revoked,
}: {
  token: ShareTokenInfo;
  petName: string;
  copied: boolean;
  onCopy: () => void;
  onRevoke: () => void;
  onDelete: () => void;
  buildUrl: (t: string) => string;
  expired?: boolean;
  revoked?: boolean;
}) {
  const expiresDate = new Date(token.expiresAt);
  const daysLeft = Math.max(0, Math.ceil((expiresDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
  const lastViewed = token.viewedAt ? new Date(token.viewedAt) : null;

  return (
    <div className={cn(
      "rounded-lg border p-2.5 transition-all",
      revoked
        ? "border-rose-200 dark:border-rose-900/60 bg-rose-50/40 dark:bg-rose-950/20 opacity-70"
        : expired
        ? "border-amber-200 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/20 opacity-80"
        : "border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20",
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-xs truncate">
              {token.label || `${petName} report`}
            </span>
            {revoked ? (
              <Badge variant="outline" className="text-[9px] border-rose-400 text-rose-700 dark:border-rose-800 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50">
                Revoked
              </Badge>
            ) : expired ? (
              <Badge variant="outline" className="text-[9px] border-amber-400 text-amber-700 dark:border-amber-800 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50">
                Expired
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[9px] border-emerald-400 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50">
                {daysLeft}d left
              </Badge>
            )}
            <Badge variant="secondary" className="text-[9px] gap-0.5 font-normal">
              <Eye className="h-2.5 w-2.5" /> {token.viewCount}
            </Badge>
          </div>
          <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-0.5">
              <Calendar className="h-2.5 w-2.5" /> Created {new Date(token.createdAt).toLocaleDateString()}
            </span>
            <span>·</span>
            <span>Expires {expiresDate.toLocaleDateString()}</span>
            {lastViewed && (
              <>
                <span>·</span>
                <span>Last viewed {lastViewed.toLocaleDateString()}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex gap-0.5 shrink-0">
          {!revoked && !expired && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={onCopy}
                title="Copy link"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => window.open(buildUrl(token.token), "_blank")}
                title="Open in new tab (preview)"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-amber-600 hover:text-amber-700"
                onClick={onRevoke}
                title="Revoke (link stops working)"
              >
                <ShieldAlert className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={onDelete}
            title="Delete permanently"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
