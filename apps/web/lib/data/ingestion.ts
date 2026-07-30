import "server-only";
import { prisma } from "@safeplate/database";
import type { IngestionRun } from "@safeplate/database";

const RECENT_RUNS_LIMIT = 20;

/** Most recent ingestion runs, newest first, for /status. */
export async function getRecentIngestionRuns(): Promise<IngestionRun[]> {
  return prisma.ingestionRun.findMany({
    orderBy: { startedAt: "desc" },
    take: RECENT_RUNS_LIMIT,
  });
}
