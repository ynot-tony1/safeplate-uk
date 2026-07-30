import "server-only";
import { prisma } from "@safeplate/database";
import type { IngestionRun } from "@safeplate/database";
import { RATING_KEYS } from "@safeplate/shared";
import { ratingLabel } from "../rating-labels";
import {
  asNumberRecord,
  getLatestGlobalMetric,
  getLatestPerAuthorityMetrics,
} from "./daily-metrics";

export interface RatingDatum {
  key: string;
  label: string;
  count: number;
}

export interface LabeledCount {
  label: string;
  count: number;
}

export interface MonthlyCount {
  month: string;
  count: number;
}

export interface RatingByScheme {
  scheme: string;
  key: string;
  label: string;
  count: number;
}

export interface AuthorityProportion {
  code: string;
  name: string;
  proportion: number;
  total: number;
}

export interface AuthorityRecency {
  code: string;
  name: string;
  avgDays: number;
}

export interface DashboardData {
  hasMetrics: boolean;
  metricDate: Date | null;
  totalEstablishments: number;
  rated5Count: number;
  rated0to2Count: number;
  awaitingCount: number;
  newRatingPendingCount: number;
  inspectionsLatestMonth: number;
  participatingAuthorities: number;
  latestSuccessfulRun: IngestionRun | null;
  sourceExtractDate: Date | null;
  ratingDistribution: RatingDatum[];
  businessTypeMix: LabeledCount[];
  inspectionsByMonth: MonthlyCount[];
  ratingByScheme: RatingByScheme[];
  worstAuthorities: AuthorityProportion[];
  mostRecentlyInspectedAuthorities: AuthorityRecency[];
  leastRecentlyInspectedAuthorities: AuthorityRecency[];
}

function toRatingData(json: unknown): RatingDatum[] {
  const record = asNumberRecord(json);
  return RATING_KEYS.filter((key) => key in record).map((key) => ({
    key,
    label: ratingLabel(key),
    count: record[key] ?? 0,
  }));
}

function toLabeledCounts(json: unknown): LabeledCount[] {
  const record = asNumberRecord(json);
  return Object.entries(record)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

function toMonthlyCounts(json: unknown): MonthlyCount[] {
  const record = asNumberRecord(json);
  return Object.entries(record)
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

/**
 * Assembles every metric/chart the dashboard needs. Reads almost entirely
 * from precomputed DailyMetric rows so the page never runs an aggregate over
 * the (potentially huge) establishments table — the two exceptions are the
 * single MAX(sourceExtractDate) scalar and the tiny scheme x rating groupBy,
 * both of which are cheap regardless of table size (an indexed scalar
 * aggregate and a groupBy over a handful of enum combinations respectively).
 */
export async function getDashboardData(): Promise<DashboardData> {
  const [globalMetric, perAuthority, latestSuccessfulRun, extractAgg, schemeRatingGroups] =
    await Promise.all([
      getLatestGlobalMetric(),
      getLatestPerAuthorityMetrics(),
      prisma.ingestionRun.findFirst({
        where: { status: "SUCCESS" },
        orderBy: { completedAt: "desc" },
      }),
      prisma.establishment.aggregate({ _max: { sourceExtractDate: true } }),
      prisma.establishment.groupBy({
        by: ["schemeType", "ratingKey"],
        where: { isActive: true },
        _count: { _all: true },
      }),
    ]);

  const worstAuthorities: AuthorityProportion[] = perAuthority
    .map(({ metric, authority }) => ({
      code: metric.localAuthorityCode as string,
      name: authority?.name ?? (metric.localAuthorityCode as string),
      total: metric.totalEstablishments,
      proportion:
        metric.totalEstablishments > 0 ? metric.rated0to2Count / metric.totalEstablishments : 0,
    }))
    .filter((a) => a.total > 0)
    .sort((a, b) => b.proportion - a.proportion)
    .slice(0, 10);

  const withRecency: AuthorityRecency[] = perAuthority
    .filter(({ metric }) => metric.avgDaysSinceInspection != null)
    .map(({ metric, authority }) => ({
      code: metric.localAuthorityCode as string,
      name: authority?.name ?? (metric.localAuthorityCode as string),
      avgDays: metric.avgDaysSinceInspection as number,
    }));

  const mostRecentlyInspectedAuthorities = [...withRecency]
    .sort((a, b) => a.avgDays - b.avgDays)
    .slice(0, 10);
  const leastRecentlyInspectedAuthorities = [...withRecency]
    .sort((a, b) => b.avgDays - a.avgDays)
    .slice(0, 10);

  const ratingByScheme: RatingByScheme[] = schemeRatingGroups
    .filter((g) => g.ratingKey != null)
    .map((g) => ({
      scheme: g.schemeType,
      key: g.ratingKey as string,
      label: ratingLabel(g.ratingKey),
      count: g._count._all,
    }));

  return {
    hasMetrics: globalMetric != null,
    metricDate: globalMetric?.metricDate ?? null,
    totalEstablishments: globalMetric?.totalEstablishments ?? 0,
    rated5Count: globalMetric?.rated5Count ?? 0,
    rated0to2Count: globalMetric?.rated0to2Count ?? 0,
    awaitingCount: globalMetric?.awaitingCount ?? 0,
    newRatingPendingCount: globalMetric?.newRatingPendingCount ?? 0,
    inspectionsLatestMonth: globalMetric?.inspectionsLatestMonth ?? 0,
    participatingAuthorities: globalMetric?.participatingAuthorities ?? 0,
    latestSuccessfulRun,
    sourceExtractDate: extractAgg._max.sourceExtractDate,
    ratingDistribution: toRatingData(globalMetric?.ratingDistribution),
    businessTypeMix: toLabeledCounts(globalMetric?.businessTypeMix),
    inspectionsByMonth: toMonthlyCounts(globalMetric?.inspectionsByMonth),
    ratingByScheme,
    worstAuthorities,
    mostRecentlyInspectedAuthorities,
    leastRecentlyInspectedAuthorities,
  };
}
