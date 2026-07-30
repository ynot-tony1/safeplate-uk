import { NextResponse } from "next/server";
import { prisma } from "@safeplate/database";

export const dynamic = "force-dynamic";

const HEALTH_CHECK_TIMEOUT_MS = 3000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

/**
 * Lightweight liveness/readiness check. Never leaks connection strings or
 * stack traces — a database outage is reported as a clean, generic status
 * value, not an exception body.
 */
export async function GET() {
  const timestamp = new Date().toISOString();

  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`, HEALTH_CHECK_TIMEOUT_MS);
    return NextResponse.json({ status: "ok", database: "ok", timestamp });
  } catch {
    return NextResponse.json(
      { status: "degraded", database: "error", timestamp },
      { status: 503 },
    );
  }
}
