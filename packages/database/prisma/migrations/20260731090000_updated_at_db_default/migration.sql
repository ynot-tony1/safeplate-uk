-- Prisma's @updatedAt only sets the value client-side on writes made
-- through Prisma Client; it was never a database DEFAULT, so the initial
-- INSERT for a brand-new row (as done by the ingestor's raw SQL upserts,
-- which never go through Prisma Client) violated the NOT NULL constraint.
-- The ingestor's ON CONFLICT ... UPDATE clauses already set
-- updated_at = now() explicitly, so this only needed fixing for first-time
-- inserts.
ALTER TABLE "business_types" ALTER COLUMN "updated_at" SET DEFAULT current_timestamp();

ALTER TABLE "local_authorities" ALTER COLUMN "updated_at" SET DEFAULT current_timestamp();

ALTER TABLE "establishments" ALTER COLUMN "updated_at" SET DEFAULT current_timestamp();
