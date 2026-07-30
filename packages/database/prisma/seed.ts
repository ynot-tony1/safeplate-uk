/**
 * Local-development fixture seed — LOCAL ONLY, never run against a real
 * environment. Populates ~40 invented establishments across 5 invented
 * local authorities (centered on real UK city coordinates so the map/
 * dashboard render something visually sensible), plus one IngestionRun and
 * a set of DailyMetric rows computed FROM the generated fixture data, so
 * every number shown on the dashboard/local-authorities pages is internally
 * consistent with what /establishments and /map actually return.
 */
import { PrismaClient, type SchemeType } from "../generated/client/index.js";

const prisma = new PrismaClient();

const BUSINESS_TYPES = [
  { id: 1, description: "Restaurant/Cafe/Canteen" },
  { id: 2, description: "Takeaway/sandwich shop" },
  { id: 3, description: "Pub/bar/nightclub" },
  { id: 4, description: "Retailers - supermarkets/hypermarkets" },
  { id: 5, description: "Hotel/bed & breakfast/guest house" },
  { id: 6, description: "School/college/university canteen" },
];

interface CityDef {
  code: string;
  name: string;
  regionName: string;
  scheme: SchemeType;
  lat: number;
  lon: number;
  postcodeArea: string;
}

const CITIES: CityDef[] = [
  { code: "FIX-LON", name: "Fixture Borough of London", regionName: "London", scheme: "FHRS", lat: 51.5074, lon: -0.1278, postcodeArea: "SW1A" },
  { code: "FIX-MAN", name: "Fixture City of Manchester", regionName: "North West", scheme: "FHRS", lat: 53.4808, lon: -2.2426, postcodeArea: "M1" },
  { code: "FIX-BIR", name: "Fixture City of Birmingham", regionName: "West Midlands", scheme: "FHRS", lat: 52.4862, lon: -1.8904, postcodeArea: "B1" },
  { code: "FIX-EDI", name: "Fixture City of Edinburgh", regionName: "Scotland", scheme: "FHIS", lat: 55.9533, lon: -3.1883, postcodeArea: "EH1" },
  { code: "FIX-BRI", name: "Fixture City of Bristol", regionName: "South West", scheme: "FHRS", lat: 51.4545, lon: -2.5879, postcodeArea: "BS1" },
];

const FHRS_RATING_KEYS = ["5", "5", "5", "4", "4", "4", "3", "3", "2", "1", "0", "awaiting_inspection"] as const;
const FHIS_RATING_KEYS = ["pass", "pass", "pass", "pass", "improvement_required", "awaiting_inspection"] as const;

const RATING_KEY_TO_RAW_VALUE: Record<string, string> = {
  pass: "Pass",
  improvement_required: "Improvement Required",
  awaiting_inspection: "AwaitingInspection",
  awaiting_publication: "AwaitingPublication",
  exempt: "Exempt",
};

const BUSINESS_NAME_STEMS = [
  "The Anchor",
  "The Crown",
  "Riverside",
  "Golden Spoon",
  "The Old Mill",
  "Spice Route",
  "Harbour View",
  "The Fox & Hound",
  "Corner Deli",
  "Market Kitchen",
  "The Plough",
  "Sunny Side",
  "The Bell",
  "Green Leaf",
  "Station Buffet",
  "The Ivy House",
  "Blue Elephant",
  "The Malt House",
  "Garden Cafe",
  "The Ship Inn",
];

function pick<T>(arr: readonly T[]): T {
  const item = arr[Math.floor(Math.random() * arr.length)];
  if (item === undefined) throw new Error("pick() called on empty array");
  return item;
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function main() {
  console.log("Seeding local fixture data...");

  await prisma.ratingChange.deleteMany();
  await prisma.establishment.deleteMany();
  await prisma.dailyMetric.deleteMany();
  await prisma.ingestionRun.deleteMany();
  await prisma.localAuthority.deleteMany();
  await prisma.businessType.deleteMany();

  await prisma.businessType.createMany({ data: BUSINESS_TYPES });

  const today = daysAgo(0);

  await prisma.localAuthority.createMany({
    data: CITIES.map((c) => ({
      code: c.code,
      name: c.name,
      regionName: c.regionName,
      schemeType: c.scheme,
      openDataUrl: `https://example-invalid.test/open-data/${c.code.toLowerCase()}.xml`,
      lastExtractDate: today,
    })),
  });

  const ESTABLISHMENTS_PER_CITY = 8;
  type EstablishmentSeed = {
    fhrsId: string;
    businessName: string;
    normalisedName: string;
    businessTypeId: number;
    businessTypeName: string;
    postcode: string;
    postcodePrefix: string;
    localAuthorityCode: string;
    localAuthorityName: string;
    ratingValue: string | null;
    ratingKey: string | null;
    ratingDate: Date | null;
    schemeType: SchemeType;
    newRatingPending: boolean;
    hygieneScore: number | null;
    structuralScore: number | null;
    confidenceManagementScore: number | null;
    latitude: number;
    longitude: number;
  };

  const establishments: EstablishmentSeed[] = [];
  let counter = 1;

  for (const city of CITIES) {
    for (let i = 0; i < ESTABLISHMENTS_PER_CITY; i++) {
      const fhrsId = `FIXTURE-${String(counter).padStart(5, "0")}`;
      counter += 1;

      const businessType = pick(BUSINESS_TYPES);
      const nameStem = pick(BUSINESS_NAME_STEMS);
      const businessName = `${nameStem} ${city.name.split(" ").pop()}`;
      const ratingKey = city.scheme === "FHIS" ? pick(FHIS_RATING_KEYS) : pick(FHRS_RATING_KEYS);
      const hasScoredRating = city.scheme === "FHRS" && /^[0-5]$/.test(ratingKey);
      const ratingDate = ratingKey === "awaiting_inspection" ? null : daysAgo(Math.floor(randomBetween(10, 720)));

      establishments.push({
        fhrsId,
        businessName,
        normalisedName: businessName.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim(),
        businessTypeId: businessType.id,
        businessTypeName: businessType.description,
        postcode: `${city.postcodeArea} ${Math.floor(randomBetween(1, 9))}${["AA", "BB", "XY", "ZZ"][counter % 4]}`,
        postcodePrefix: city.postcodeArea,
        localAuthorityCode: city.code,
        localAuthorityName: city.name,
        ratingValue: ratingKey === "awaiting_inspection" ? null : (RATING_KEY_TO_RAW_VALUE[ratingKey] ?? ratingKey),
        ratingKey,
        ratingDate,
        schemeType: city.scheme,
        newRatingPending: Math.random() < 0.1,
        hygieneScore: hasScoredRating ? Math.floor(randomBetween(0, 25)) : null,
        structuralScore: hasScoredRating ? Math.floor(randomBetween(0, 20)) : null,
        confidenceManagementScore: hasScoredRating ? Math.floor(randomBetween(0, 30)) : null,
        latitude: city.lat + randomBetween(-0.06, 0.06),
        longitude: city.lon + randomBetween(-0.1, 0.1),
      });
    }
  }

  for (const e of establishments) {
    await prisma.establishment.create({
      data: {
        ...e,
        addressLine1: `${Math.floor(randomBetween(1, 200))} High Street`,
        addressLine2: e.localAuthorityName,
        sourceExtractDate: today,
        isActive: true,
        firstSeenAt: daysAgo(400),
        lastSeenAt: today,
      },
    });
  }

  // A handful of rating-history entries so /establishments/[fhrsId] has
  // something to show.
  const withHistory = establishments.slice(0, 6);
  for (const e of withHistory) {
    await prisma.ratingChange.create({
      data: {
        fhrsId: e.fhrsId,
        changedAt: daysAgo(200),
        previousRatingValue: e.schemeType === "FHIS" ? "Improvement Required" : "3",
        newRatingValue: e.ratingValue,
        previousRatingDate: daysAgo(560),
        newRatingDate: e.ratingDate,
        previousNewRatingPending: false,
        newNewRatingPending: e.newRatingPending,
      },
    });
  }

  await prisma.ingestionRun.create({
    data: {
      status: "SUCCESS",
      sourceExtractDate: today,
      localAuthoritiesChecked: CITIES.length,
      localAuthoritiesChanged: CITIES.length,
      rowsSeen: establishments.length,
      rowsInserted: establishments.length,
      rowsUpdated: 0,
      ratingChangesCreated: withHistory.length,
      rowsRejected: 0,
      startedAt: new Date(Date.now() - 5 * 60_000),
      completedAt: new Date(),
      workflowRunId: "local-fixture-seed",
      gitSha: "0000000",
    },
  });
  await prisma.ingestionRun.create({
    data: {
      status: "FAILED",
      sourceExtractDate: daysAgo(1),
      localAuthoritiesChecked: CITIES.length,
      localAuthoritiesChanged: 0,
      rowsSeen: 0,
      rowsInserted: 0,
      rowsUpdated: 0,
      ratingChangesCreated: 0,
      rowsRejected: 0,
      startedAt: daysAgo(1),
      completedAt: daysAgo(1),
      workflowRunId: "local-fixture-seed-failed",
      gitSha: "0000000",
      errorSummary: "Fixture example: simulated timeout downloading one local authority's XML extract.",
    },
  });

  // --- DailyMetric rows, computed FROM the fixture data above ---
  function ratingDistributionOf(rows: EstablishmentSeed[]): Record<string, number> {
    const dist: Record<string, number> = {};
    for (const r of rows) {
      if (!r.ratingKey) continue;
      dist[r.ratingKey] = (dist[r.ratingKey] ?? 0) + 1;
    }
    return dist;
  }
  function businessTypeMixOf(rows: EstablishmentSeed[]): Record<string, number> {
    const mix: Record<string, number> = {};
    for (const r of rows) {
      mix[r.businessTypeName] = (mix[r.businessTypeName] ?? 0) + 1;
    }
    return mix;
  }
  function inspectionsByMonthOf(rows: EstablishmentSeed[]): Record<string, number> {
    const byMonth: Record<string, number> = {};
    for (const r of rows) {
      if (!r.ratingDate) continue;
      const key = r.ratingDate.toISOString().slice(0, 7);
      byMonth[key] = (byMonth[key] ?? 0) + 1;
    }
    return byMonth;
  }
  function avgDaysSince(rows: EstablishmentSeed[]): number | null {
    const withDates = rows.filter((r) => r.ratingDate);
    if (withDates.length === 0) return null;
    const now = Date.now();
    const total = withDates.reduce((sum, r) => sum + (now - (r.ratingDate as Date).getTime()) / 86_400_000, 0);
    return total / withDates.length;
  }
  function rated0to2Count(rows: EstablishmentSeed[]): number {
    return rows.filter((r) => r.ratingKey === "0" || r.ratingKey === "1" || r.ratingKey === "2").length;
  }
  function rated5Count(rows: EstablishmentSeed[]): number {
    return rows.filter((r) => r.ratingKey === "5").length;
  }
  function awaitingCount(rows: EstablishmentSeed[]): number {
    return rows.filter((r) => r.ratingKey === "awaiting_inspection" || r.ratingKey === "awaiting_publication").length;
  }

  await prisma.dailyMetric.create({
    data: {
      metricDate: today,
      scope: "global",
      localAuthorityCode: null,
      totalEstablishments: establishments.length,
      rated5Count: rated5Count(establishments),
      rated0to2Count: rated0to2Count(establishments),
      awaitingCount: awaitingCount(establishments),
      newRatingPendingCount: establishments.filter((e) => e.newRatingPending).length,
      inspectionsLatestMonth: Object.values(inspectionsByMonthOf(establishments)).at(-1) ?? 0,
      participatingAuthorities: CITIES.length,
      avgDaysSinceInspection: avgDaysSince(establishments),
      businessTypeMix: businessTypeMixOf(establishments),
      ratingDistribution: ratingDistributionOf(establishments),
      inspectionsByMonth: inspectionsByMonthOf(establishments),
    },
  });

  for (const city of CITIES) {
    const rows = establishments.filter((e) => e.localAuthorityCode === city.code);
    await prisma.dailyMetric.create({
      data: {
        metricDate: today,
        scope: city.code,
        localAuthorityCode: city.code,
        totalEstablishments: rows.length,
        rated5Count: rated5Count(rows),
        rated0to2Count: rated0to2Count(rows),
        awaitingCount: awaitingCount(rows),
        newRatingPendingCount: rows.filter((e) => e.newRatingPending).length,
        inspectionsLatestMonth: Object.values(inspectionsByMonthOf(rows)).at(-1) ?? 0,
        participatingAuthorities: 1,
        avgDaysSinceInspection: avgDaysSince(rows),
        businessTypeMix: businessTypeMixOf(rows),
        ratingDistribution: ratingDistributionOf(rows),
        inspectionsByMonth: inspectionsByMonthOf(rows),
      },
    });
  }

  console.log(`Seeded ${establishments.length} establishments across ${CITIES.length} local authorities.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
