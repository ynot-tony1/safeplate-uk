import type { Metadata } from "next";
import Link from "next/link";
import {
  BadgeCheck,
  Building2,
  ClipboardCheck,
  Hourglass,
  MapPinned,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  ShieldX,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { StatTile } from "@/components/stat-tile";
import { RatingDistributionChart } from "@/components/charts/rating-distribution-chart";
import { LabeledBarChart } from "@/components/charts/labeled-bar-chart";
import { InspectionsByMonthChart } from "@/components/charts/inspections-by-month-chart";
import { RatingBySchemeChart } from "@/components/charts/rating-by-scheme-chart";
import { getDashboardData } from "@/lib/data/dashboard";
import { formatNumber } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // Hardcoded rather than "Dashboard" — the root "/" segment doesn't pick up
  // the layout's title.template the way every other route does.
  title: "Dashboard — SafePlate UK",
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
      <h1 className="sr-only">Dashboard</h1>

      <section
        aria-label="Key metrics"
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
      >
        <StatTile
          label="Indexed establishments"
          value={formatNumber(data.totalEstablishments)}
          icon={Building2}
          tone="blue"
        />
        <StatTile
          label="Inspections (last 30 days)"
          value={formatNumber(data.inspectionsLatestMonth)}
          icon={ClipboardCheck}
          tone="aqua"
        />
        <StatTile
          label="Participating local authorities"
          value={formatNumber(data.participatingAuthorities)}
          icon={MapPinned}
          tone="magenta"
        />
      </section>

      <section aria-label="Rating breakdown" className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Rating breakdown</h2>
          <p className="text-xs text-muted-foreground">
            Every indexed establishment falls into exactly one of the first seven tiles below — they
            sum to the total. &ldquo;New rating pending&rdquo; is shown separately since it&rsquo;s
            a flag that can apply on top of any current rating, not a rating outcome of its own.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <StatTile
            label="Rated 5"
            value={formatNumber(data.rated5Count)}
            icon={ShieldCheck}
            tone="good"
          />
          <StatTile
            label="Rated 3–4"
            value={formatNumber(data.rated3to4Count)}
            icon={Shield}
            tone="warning"
          />
          <StatTile
            label="Rated 0–2"
            value={formatNumber(data.rated0to2Count)}
            icon={ShieldX}
            tone="critical"
          />
          <StatTile
            label="Pass (FHIS)"
            value={formatNumber(data.fhisPassCount)}
            icon={BadgeCheck}
            tone="good"
            hint="Scotland's Pass / Pass and Eat Safe outcomes"
          />
          <StatTile
            label="Improvement required (FHIS)"
            value={formatNumber(data.improvementRequiredCount)}
            icon={ShieldAlert}
            tone="critical"
          />
          <StatTile
            label="Awaiting inspection / publication"
            value={formatNumber(data.awaitingCount)}
            icon={Hourglass}
            tone="amber"
          />
          <StatTile
            label="Exempt / not yet rated"
            value={formatNumber(data.exemptOrUnratedCount)}
            icon={ShieldQuestion}
            tone="neutral"
          />
          <StatTile
            label="New rating pending"
            value={formatNumber(data.newRatingPendingCount)}
            icon={Hourglass}
            tone="amber"
            hint="overlaps with the tiles above — not part of the total"
          />
        </div>
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
