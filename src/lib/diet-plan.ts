import { z } from "zod";
import type { DietPlanFediafMeta } from "@/lib/types";

export const dietPlanFediafMetaSchema: z.ZodType<DietPlanFediafMeta> = z.object({
  version: z.string().trim().min(1).max(100),
  stageCode: z.string().trim().min(1).max(100),
  disclaimerRu: z.string().trim().min(1).max(20_000),
  sourceTitle: z.string().trim().min(1).max(1_000).optional(),
  sourceUrl: z.string().url().max(2_000).optional(),
  savedAt: z.string().datetime({ offset: true }),
});

export function parseDietPlanFediafMeta(value: unknown): DietPlanFediafMeta | null {
  let candidate = value;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return null;
    }
  }

  const parsed = dietPlanFediafMetaSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}
