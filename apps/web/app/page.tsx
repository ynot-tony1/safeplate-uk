import type { Metadata } from "next";
import Link from "next/link";
import {
  Building2,
  CalendarClock,
  ClipboardCheck,
  Hourglass,
  MapPinned,
  ShieldCheck,
  ShieldX,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { StatTile } from "@/components/stat-tile";
import { RatingDistributionChart } from "@/components/charts/rating-distribution-chart";
import { LabeledBarChart } from "@/components/charts/labeled-bar-chart";
import { InspectionsByMonthChart } from "@/components/charts/inspections-by-month-chart";
import { RatingBySchemeChart } from "@/components/charts/rating-by-scheme-chart";
import { getDashboardData } from "@/lib/data/dashboard";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Site-wide UK food hygiene rating statistics.",
};

export default async function DashboardPage() {
  const data = await getDashboardData();

  if (!data.hasMetrics) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <Alert>
          <Hourglass className="size-4" />
          <AlertTitle>No data yet</AlertTitle>
          <AlertDescription>
            No daily metrics have been computed yet — this happens once the nightly ingestion
            pipeline has run at least once. Check the{" "}
            <Link className="underline" href="/status">
              status page
            </Link>{" "}
            for the latest ingestion run.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Metrics computed {formatDate(data.metricDate)}
          {data.sourceExtractDate && (
            <> · source extract dated {formatDate(data.sourceExtractDate)}</>
          )}
        </p>
      </div>

      <section
        aria-label="Key metrics"
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
      >
        <StatTile
          label="Indexed establishments"
          value={formatNumber(data.totalEstablishments)}
          icon={Building2}
        />
        <StatTile label="Rated 5" value={formatNumber(data.rated5Count)} icon={ShieldCheck} />
        <StatTile label="Rated 0–2" value={formatNumber(data.rated0to2Count)} icon={ShieldX} />
        <StatTile
          label="Awaiting / new rating pending"
          value={formatNumber(data.awaitingCount + data.newRatingPendingCount)}
          icon={Hourglass}
        />
        <StatTile
          label="Inspections (latest month)"
          value={formatNumber(data.inspectionsLatestMonth)}
          icon={ClipboardCheck}
        />
        <StatTile
          label="Participating local authorities"
          value={formatNumber(data.participatingAuthorities)}
          icon={MapPinned}
        />
        <StatTile
          label="Latest successful ingestion"
          value={
            data.latestSuccessfulRun ? formatDateTime(data.latestSuccessfulRun.completedAt) : "—"
          }
          icon={CalendarClock}
        />
        <StatTile
          label="Source extract date"
          value={formatDate(data.sourceExtractDate)}
          hint="as recorded across all currently-indexed establishments"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2" aria-label="Charts">
        <RatingDistributionChart data={data.ratingDistribution} />
        <RatingBySchemeChart data={data.ratingByScheme} />
        <LabeledBarChart
          title="Establishments by business type"
          description="Top business types by establishment count"
          data={data.businessTypeMix.slice(0, 12).map((d) => ({ label: d.label, value: d.count }))}
        />
        <InspectionsByMonthChart data={data.inspectionsByMonth} />
        <LabeledBarChart
          title="Highest proportion rated 0–2"
          description="Top 10 local authorities by share of poorly-rated establishments"
          data={data.worstAuthorities.map((a) => ({ label: a.name, value: a.proportion }))}
          valueFormat="percent"
          color="var(--chart-critical)"
        />
        <LabeledBarChart
          title="Least recently inspected"
          description="Top 10 local authorities by average days since last inspection"
          data={data.leastRecentlyInspectedAuthorities.map((a) => ({
            label: a.name,
            value: a.avgDays,
          }))}
          valueFormat="days"
          color="var(--chart-cat-6)"
        />
      </section>
    </div>
  );
}
