import { PrismaClient } from "../generated/client/index.js";

declare global {
  // eslint-disable-next-line no-var
  var __safeplatePrisma: PrismaClient | undefined;
}

/**
 * Singleton Prisma client. Reuses the instance across hot reloads in dev
 * and across warm Vercel Fluid Compute invocations to avoid exhausting
 * CockroachDB connections.
 */
export const prisma: PrismaClient =
  globalThis.__safeplatePrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__safeplatePrisma = prisma;
}

export * from "../generated/client/index.js";
