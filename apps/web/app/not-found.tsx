import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center gap-3 py-24 text-center">
      <h1 className="text-2xl font-semibold">Not found</h1>
      <p className="text-sm text-muted-foreground">
        We couldn&apos;t find the page or establishment you were looking for.
      </p>
      <Link
        href="/"
        className="mt-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
