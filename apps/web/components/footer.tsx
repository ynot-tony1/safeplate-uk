import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t mt-16">
      <div className="mx-auto max-w-7xl px-4 py-8 text-sm text-muted-foreground sm:px-6">
        <p>
          SafePlate UK is an independent portfolio project built on the Food Standards Agency&apos;s
          FHRS/FHIS open data. It is not affiliated with the FSA.
        </p>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
          <Link href="/about/data" className="hover:underline">
            About the data
          </Link>
          <Link href="/status" className="hover:underline">
            Status
          </Link>
          <a
            href="https://ratings.food.gov.uk/open-data"
            target="_blank"
            rel="noreferrer noopener"
            className="hover:underline"
          >
            FSA open data
          </a>
        </div>
      </div>
    </footer>
  );
}
