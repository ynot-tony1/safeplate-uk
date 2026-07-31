import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

function findQueryEngineFiles(root: string, maxDepth: number): string[] {
  const found: string[] = [];
  function walk(dir: string, depth: number) {
    if (depth > maxDepth) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.name.includes("query_engine")) {
        found.push(full);
      }
      if (entry.isDirectory() && !entry.name.startsWith(".")) {
        walk(full, depth + 1);
      }
    }
  }
  walk(root, 0);
  return found;
}

export async function GET() {
  const cwd = process.cwd();
  const dirname = __dirname;
  const varTaskListing = fs.existsSync("/var/task")
    ? fs.readdirSync("/var/task", { withFileTypes: true }).map((e) => e.name)
    : null;
  const engineFiles = [
    ...findQueryEngineFiles(cwd, 6),
    ...(fs.existsSync("/var/task") ? findQueryEngineFiles("/var/task", 6) : []),
  ];

  return NextResponse.json({
    cwd,
    dirname,
    varTaskListing,
    engineFiles: [...new Set(engineFiles)],
  });
}
