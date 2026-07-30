import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About the data",
  description: "Where SafePlate UK's food hygiene data comes from and how to interpret it.",
};

const h2Class = "mt-8 text-lg font-semibold";
const pClass = "mt-3 text-sm leading-relaxed text-muted-foreground";
const linkClass = "underline hover:text-foreground";

export default function AboutDataPage() {
  return (
    <article className="max-w-3xl space-y-1">
      <h1 className="text-2xl font-semibold">About the data</h1>

      <p className={pClass}>
        SafePlate UK is built entirely on official open data published by the{" "}
        <a
          className={linkClass}
          href="https://www.food.gov.uk/"
          target="_blank"
          rel="noreferrer noopener"
        >
          Food Standards Agency
        </a>{" "}
        (FSA) via its{" "}
        <a
          className={linkClass}
          href="https://ratings.food.gov.uk/open-data"
          target="_blank"
          rel="noreferrer noopener"
        >
          FHRS/FHIS open data service
        </a>
        . We do not collect, verify, or independently inspect any establishment ourselves —
        everything shown here is a re-presentation of the FSA&apos;s published records.
      </p>

      <h2 className={h2Class}>FHRS vs FHIS</h2>
      <p className={pClass}>
        The <strong className="text-foreground">Food Hygiene Rating Scheme (FHRS)</strong> covers
        England, Wales, and Northern Ireland. Establishments are given a numeric score from{" "}
        <strong className="text-foreground">5</strong> (very good) down to{" "}
        <strong className="text-foreground">0</strong> (urgent improvement necessary), based on an
        inspector&apos;s assessment of food hygiene practices, the condition of the premises, and
        how well management systems are run.
      </p>
      <p className={pClass}>
        The <strong className="text-foreground">Food Hygiene Information Scheme (FHIS)</strong>{" "}
        covers Scotland, where local authorities instead publish a binary{" "}
        <strong className="text-foreground">Pass</strong> or{" "}
        <strong className="text-foreground">Improvement Required</strong> outcome, alongside
        supporting detail where available.
      </p>
      <p className={pClass}>
        Some establishments in either scheme may show as{" "}
        <strong className="text-foreground">Exempt</strong>,{" "}
        <strong className="text-foreground">Awaiting Inspection</strong>, or{" "}
        <strong className="text-foreground">Awaiting Publication</strong> rather than a scored
        rating — this is normal and does not necessarily indicate a problem.
      </p>

      <h2 className={h2Class}>How the data gets here</h2>
      <p className={pClass}>
        A scheduled GitHub Actions workflow runs nightly, downloading each participating local
        authority&apos;s published FHRS/FHIS XML open-data file directly from the FSA, and importing
        any new or changed establishment records. We only write a rating-history entry when a
        rating, rating date, score, or pending-rating status actually changes between two imports —
        not on every import — so the history you see reflects real changes over time, not noise from
        re-publishing identical data.
      </p>

      <h2 className={h2Class}>Interpreting a rating date</h2>
      <p className={pClass}>
        A rating date is{" "}
        <strong className="text-foreground">
          the date of the inspection that produced that rating
        </strong>{" "}
        — it is not a guarantee of current freshness. A business can maintain the same rating for
        years without a new inspection, or standards may have changed since the date shown. Always
        check the <strong className="text-foreground">source extract date</strong> shown on each
        establishment&apos;s page, which tells you how current our copy of the local
        authority&apos;s data is.
      </p>

      <h2 className={h2Class}>Geolocation limitations</h2>
      <p className={pClass}>
        Latitude/longitude coordinates, where present, are supplied by the local authority as part
        of the open data extract. We do not independently verify or geocode these coordinates
        ourselves — some establishments may have imprecise, missing, or occasionally incorrect
        coordinates as published by the source.
      </p>

      <h2 className={h2Class}>Limitations</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
        <li>
          Coverage depends on which local authorities have published usable open data recently.
        </li>
        <li>Ratings can lag real-world conditions by months between inspections.</li>
        <li>
          Business names, addresses, and types are exactly as published — we do not correct
          spelling, deduplicate near-identical entries, or infer closures beyond what the source
          data indicates.
        </li>
        <li>
          This is an independent portfolio project, not an official FSA product, and should not be
          relied upon as the sole basis for a food safety decision — always consult the{" "}
          <a
            className={linkClass}
            href="https://ratings.food.gov.uk/"
            target="_blank"
            rel="noreferrer noopener"
          >
            FSA&apos;s own ratings site
          </a>{" "}
          for authoritative, current information.
        </li>
      </ul>
    </article>
  );
}
