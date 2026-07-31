import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/client/index.js";

declare global {
  // eslint-disable-next-line no-var
  var __safeplatePrisma: PrismaClient | undefined;
}

// Uses the pg driver adapter (WASM query compiler, no native query-engine
// binary) instead of the default binary engine. Native engine binaries are
// not reliably traceable into Vercel's serverless function bundle across
// monorepo package boundaries — this sidesteps that entire class of
// "could not locate the Query Engine" deployment failures.
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
