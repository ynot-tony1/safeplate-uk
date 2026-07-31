import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/client/index.js";

declare global {
  // eslint-disable-next-line no-var
  var __safeplatePrisma: PrismaClient | undefined;
}

// The pg driver adapter handles DB I/O, but the default "library" engine
// type still needs the native query-engine binary for query compilation.
// Next's Turbopack bundling gives that binary's loader a synthetic
// __dirname (not a real filesystem path), so Prisma's own relative-path
// search for the binary can never succeed on Vercel even though the file
// is genuinely present (confirmed via a temporary filesystem-inspection
// route) at /var/task/packages/database/generated/client/. Pointing
// PRISMA_QUERY_ENGINE_LIBRARY there directly bypasses that broken search.
// Set here (at runtime, on first import) rather than as a Vercel project
// env var — the build-time `prisma generate` step also reads this var and
// fails outright if it's set to a path that doesn't exist yet at that
// point in the build.
if (process.env.VERCEL === "1" && !process.env.PRISMA_QUERY_ENGINE_LIBRARY) {
  process.env.PRISMA_QUERY_ENGINE_LIBRARY =
    "/var/task/packages/database/generated/client/libquery_engine-rhel-openssl-3.0.x.so.node";
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

/**
 * Singleton Prisma client. Reuses the instance across hot reloads in dev
 * and across warm Vercel Fluid Compute invocations to avoid exhausting
 * CockroachDB connections.
 */
export const prisma: PrismaClient =
  globalThis.__safeplatePrisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__safeplatePrisma = prisma;
}

export * from "../generated/client/index.js";
