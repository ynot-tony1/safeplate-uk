import type { Metadata } from "next";
import { AlertOctagon, CheckCircle2, CircleDashed, XCircle } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getRecentIngestionRuns } from "@/lib/data/ingestion";
import { formatDateTime, formatNumber } from "@/lib/format";
import packageJson from "../../package.json";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Status",
  description: "Ingestion run history and application health status.",
};

const STATUS_ICON: Record<string, typeof CheckCircle2> = {
  SUCCESS: CheckCircle2,
  RUNNING: CircleDashed,
  FAILED: XCircle,
  PARTIAL: AlertOctagon,
};

const STATUS_COLOR: Record<string, string> = {
  SUCCESS: "var(--chart-good)",
  RUNNING: "var(--chart-ink-muted)",
  FAILED: "var(--chart-critical)",
  PARTIAL: "var(--chart-warning)",
};

function appVersion(): string {
  return (
    process.env.NEXT_PUBLIC_APP_VERSION ??
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ??
    packageJson.version
  );
}

export default async function StatusPage() {
  const runs = await getRecentIngestionRuns();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Status</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ingestion pipeline health only. This page never displays connection strings, credentials,
          or other infrastructure detail.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border bg-card p-4">
          <h2 className="text-xs font-medium text-muted-foreground">Application version</h2>
          <p className="mt-1 font-mono text-sm">{appVersion()}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <h2 className="text-xs font-medium text-muted-foreground">Health check</h2>
          <p className="mt-1 text-sm">
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">GET /api/health</code> — a fast
            database connectivity check, returned as JSON.
          </p>
        </div>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Recent ingestion runs</h2>
        {runs.length === 0 ? (
          <p className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
            No ingestion runs recorded yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead>Rows seen</TableHead>
                  <TableHead>Inserted</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead>Rejected</TableHead>
                  <TableHead>Rating changes</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => {
                  const Icon = STATUS_ICON[run.status] ?? CircleDashed;
                  return (
                    <TableRow key={run.id}>
                      <TableCell>
                        <span
                          className="inline-flex items-center gap-1.5 font-medium"
                          style={{ color: STATUS_COLOR[run.status] }}
                        >
                          <Icon className="size-4" aria-hidden="true" />
                          {run.status}
                        </span>
                      </TableCell>
                      <TableCell>{formatDateTime(run.startedAt)}</TableCell>
                      <TableCell>{formatDateTime(run.completedAt)}</TableCell>
                      <TableCell className="tabular-nums">{formatNumber(run.rowsSeen)}</TableCell>
                      <TableCell className="tabular-nums">
                        {formatNumber(run.rowsInserted)}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {formatNumber(run.rowsUpdated)}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {formatNumber(run.rowsRejected)}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {formatNumber(run.ratingChangesCreated)}
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
                        {run.errorSummary ?? "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
