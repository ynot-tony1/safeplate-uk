import "server-only";
import { prisma } from "@safeplate/database";
import type { DailyMetric, LocalAuthority } from "@safeplate/database";

/**
 * Latest site-wide (scope="global") DailyMetric row, or null if the ingestion
 * pipeline hasn't computed one yet (e.g. brand-new/empty database).
 */
export async function getLatestGlobalMetric(): Promise<DailyMetric | null> {
  return prisma.dailyMetric.findFirst({
    where: { scope: "global" },
    orderBy: { metricDate: "desc" },
  });
}

export interface AuthorityMetric {
  metric: DailyMetric;
  authority: LocalAuthority | null;
}

/**
 * The most recent DailyMetric row for every local authority that has one,
 * joined against LocalAuthority for display metadata. DailyMetric only grows
 * with (days * local authorities), never with total establishment count, so
 * fetching the full per-authority history and de-duplicating in application
 * code (keeping the newest metricDate per code) is cheap — this is what lets
 * /local-authorities and the dashboard's per-authority charts avoid running
 * live aggregates over the (much larger) establishments table.
 */
export async function getLatestPerAuthorityMetrics(): Promise<AuthorityMetric[]> {
  const rows = await prisma.dailyMetric.findMany({
    where: { scope: { not: "global" }, localAuthorityCode: { not: null } },
    orderBy: { metricDate: "desc" },
  });

  const seen = new Set<string>();
  const latest: DailyMetric[] = [];
  for (const row of rows) {
    const code = row.localAuthorityCode;
    if (!code || seen.has(code)) continue;
    seen.add(code);
    latest.push(row);
  }

  if (latest.length === 0) return [];

  const authorities = await prisma.localAuthority.findMany({
    where: { code: { in: latest.map((m) => m.localAuthorityCode as string) } },
  });
  const byCode = new Map(authorities.map((a) => [a.code, a]));

  return latest.map((metric) => ({
    metric,
    authority: byCode.get(metric.localAuthorityCode as string) ?? null,
  }));
}

/** JSON blobs on DailyMetric are typed `Json?` by Prisma — parse defensively. */
export function asNumberRecord(value: unknown): Record<string, number> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(n)) out[k] = n;
  }
  return out;
}
