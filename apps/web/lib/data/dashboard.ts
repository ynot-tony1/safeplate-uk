import "server-only";
import { prisma } from "@safeplate/database";
import type { IngestionRun } from "@safeplate/database";
import { ratingLabel, ratingDistributionFromRecord } from "../rating-labels";
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
  rated3to4Count: number;
  rated0to2Count: number;
  fhisPassCount: number;
  improvementRequiredCount: number;
  awaitingCount: number;
  exemptOrUnratedCount: number;
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

function sumKeys(record: Record<string, number>, keys: string[]): number {
  return keys.reduce((total, key) => total + (record[key] ?? 0), 0);
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

  const ratingRecord = asNumberRecord(globalMetric?.ratingDistribution);

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
    // All seven "Rating breakdown" tiles below are derived from the same
    // rating_key-keyed ratingRecord (rather than mixing in the separately
    // computed rated5Count/rated0to2Count/awaitingCount DailyMetric columns,
    // which are matched on raw rating_value text) so the tiles are
    // guaranteed to sum to totalEstablishments by construction, not by two
    // independently-computed aggregates happening to agree.
    rated5Count: sumKeys(ratingRecord, ["5"]),
    rated3to4Count: sumKeys(ratingRecord, ["3", "4"]),
    rated0to2Count: sumKeys(ratingRecord, ["0", "1", "2"]),
    fhisPassCount: sumKeys(ratingRecord, ["pass", "pass_and_eat_safe"]),
    improvementRequiredCount: sumKeys(ratingRecord, ["improvement_required"]),
    awaitingCount: sumKeys(ratingRecord, ["awaiting_inspection", "awaiting_publication"]),
    exemptOrUnratedCount: sumKeys(ratingRecord, ["exempt", "unrated"]),
    newRatingPendingCount: globalMetric?.newRatingPendingCount ?? 0,
    inspectionsLatestMonth: globalMetric?.inspectionsLatestMonth ?? 0,
    participatingAuthorities: globalMetric?.participatingAuthorities ?? 0,
    latestSuccessfulRun,
    sourceExtractDate: extractAgg._max.sourceExtractDate,
    ratingDistribution: ratingDistributionFromRecord(ratingRecord),
    businessTypeMix: toLabeledCounts(globalMetric?.businessTypeMix),
    inspectionsByMonth: toMonthlyCounts(globalMetric?.inspectionsByMonth),
    ratingByScheme,
    worstAuthorities,
    mostRecentlyInspectedAuthorities,
    leastRecentlyInspectedAuthorities,
  };
}
