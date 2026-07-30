import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Rating/establishment data changes nightly via ingestion, never at request
  // time from this app — all data pages use dynamic rendering (server
  // components reading the DB directly) rather than static generation, since
  // there is no build-time database available in CI/preview environments.
  // (Next 16 no longer runs ESLint as part of `next build` — linting is its
  // own pnpm script/CI step.)

  // @safeplate/shared and @safeplate/database ship untranspiled TypeScript
  // source (their package.json "main"/"types" point straight at src/index.ts,
  // with internal `./foo.js`-suffixed relative imports resolved by tsc's
  // "moduleResolution: bundler"). Turbopack treats workspace packages as
  // external by default and won't apply that .js->.ts resolution unless the
  // package is pulled into Next's own compilation graph.
  transpilePackages: ["@safeplate/shared", "@safeplate/database"],

  // Next's file tracer doesn't statically detect the Prisma query engine's
  // native .so binary (it's loaded dynamically, not via a static import), so
  // it gets left out of the serverless function bundle unless explicitly
  // included here — otherwise every DB call fails at runtime with "could
  // not locate the Query Engine" despite `binaryTargets` in schema.prisma
  // being correct and `prisma generate` having run successfully.
  outputFileTracingIncludes: {
    "/**": ["../../packages/database/generated/client/**/*"],
  },
};

export default nextConfig;
