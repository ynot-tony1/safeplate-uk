import "server-only";
import { RATING_KEYS } from "@safeplate/shared";
import { ratingLabel } from "../rating-labels";
import { asNumberRecord, getLatestPerAuthorityMetrics } from "./daily-metrics";

export interface LocalAuthoritySummary {
  code: string;
  name: string;
  regionName: string | null;
  schemeType: string;
  metricDate: Date;
  totalEstablishments: number;
  rated5Count: number;
  rated0to2Count: number;
  proportionRated0to2: number;
  awaitingCount: number;
  newRatingPendingCount: number;
  avgDaysSinceInspection: number | null;
  businessTypeMix: { label: string; count: number }[];
  ratingDistribution: { key: string; label: string; count: number }[];
}

/** Every local authority that has at least one computed DailyMetric row. */
export async function getLocalAuthoritySummaries(): Promise<LocalAuthoritySummary[]> {
  const rows = await getLatestPerAuthorityMetrics();

  return rows
    .map(({ metric, authority }) => {
      const ratingRecord = asNumberRecord(metric.ratingDistribution);
      const businessRecord = asNumberRecord(metric.businessTypeMix);
      return {
        code: metric.localAuthorityCode as string,
        name: authority?.name ?? (metric.localAuthorityCode as string),
        regionName: authority?.regionName ?? null,
        schemeType: authority?.schemeType ?? "FHRS",
        metricDate: metric.metricDate,
        totalEstablishments: metric.totalEstablishments,
        rated5Count: metric.rated5Count,
        rated0to2Count: metric.rated0to2Count,
        proportionRated0to2:
          metric.totalEstablishments > 0 ? metric.rated0to2Count / metric.totalEstablishments : 0,
        awaitingCount: metric.awaitingCount,
        newRatingPendingCount: metric.newRatingPendingCount,
        avgDaysSinceInspection: metric.avgDaysSinceInspection,
        businessTypeMix: Object.entries(businessRecord)
          .map(([label, count]) => ({ label, count }))
          .sort((a, b) => b.count - a.count),
        ratingDistribution: RATING_KEYS.filter((key) => key in ratingRecord).map((key) => ({
          key,
          label: ratingLabel(key),
          count: ratingRecord[key] ?? 0,
        })),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
