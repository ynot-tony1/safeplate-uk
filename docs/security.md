# Security & credential handling policy

## Principles

1. **No secret ever appears in chat, a commit, or a log line.** Connection
   strings, passwords, and API keys are supplied only via terminal
   environment variables or platform-native secret stores (GitHub Actions
   secrets, Vercel environment variables).
2. **Any credential that has appeared in an insecure channel (chat, a
   shared doc, a screenshot) is treated as compromised immediately** and
   must be rotated before use, regardless of the perceived sensitivity of
   the project. This is a fixed rule, not a per-project judgment call.
3. **Least privilege.** Three CockroachDB roles separate concerns so that no
   single compromised credential can both modify schema and serve
   production traffic:

   | Role            | Used by                          | Privileges                                            |
   |-----------------|-----------------------------------|--------------------------------------------------------|
   | `food_migrator` | `migrate-production.yml` only     | DDL + DML on `food_hygiene`                            |
   | `food_ingestor` | Scheduled ingestion workflow       | SELECT/INSERT/UPDATE on establishment-related tables, plus DELETE narrowly on `daily_metrics` only (a fully-derived, fully-regenerated-each-run table — see migration `20260731091500_grant_ingestor_delete_on_daily_metrics`) |
   | `food_app`      | Vercel-hosted Next.js application  | SELECT only — cannot migrate schema or bulk-modify data |

4. **Production migrations are manual and reviewed.** `prisma migrate
   deploy` runs only from a `workflow_dispatch`-triggered workflow with an
   explicit typed confirmation input — never automatically, and never
   `migrate reset` or a destructive `db push`.
5. **Bootstrap credentials are single-use and unset immediately.**
   `scripts/bootstrap_cockroachdb.py` reads `COCKROACH_BOOTSTRAP_URL` from
   the environment, never accepts it as a CLI argument, never prints it,
   and the operator is instructed to `unset` it once the three
   least-privilege roles have been created.

## Incident note

During initial setup, a CockroachDB password and full connection string
were pasted directly into the assistant chat despite the project's own
stated policy against it. Per this document's rule 2, that credential was
treated as compromised and was **not** used to provision any part of this
system, even after repeated requests to use it. A newly rotated credential,
supplied only via the `COCKROACH_BOOTSTRAP_URL` terminal environment
variable, was required before database bootstrap proceeded.
