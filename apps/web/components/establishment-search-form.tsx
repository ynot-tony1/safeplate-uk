import Link from "next/link";
import { RATING_KEYS, SCHEME_TYPES } from "@safeplate/shared";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ratingLabel } from "@/lib/rating-labels";
import type { BusinessType, LocalAuthority } from "@safeplate/database";
import { NearMeButton } from "@/components/near-me-button";

const nativeSelectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function EstablishmentSearchForm({
  businessTypes,
  localAuthorities,
  defaults,
}: {
  businessTypes: BusinessType[];
  localAuthorities: LocalAuthority[];
  defaults: Record<string, string>;
}) {
  return (
    <form method="get" action="/establishments" className="space-y-4 rounded-lg border bg-card p-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="q">Business name</Label>
          <Input id="q" name="q" defaultValue={defaults.q} placeholder="e.g. The Anchor Inn" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="postcode">Postcode</Label>
          <Input
            id="postcode"
            name="postcode"
            defaultValue={defaults.postcode}
            placeholder="e.g. SW1A 1AA"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="localAuthority">Local authority</Label>
          <select
            id="localAuthority"
            name="localAuthority"
            defaultValue={defaults.localAuthority ?? ""}
            className={nativeSelectClass}
          >
            <option value="">All local authorities</option>
            {localAuthorities.map((la) => (
              <option key={la.code} value={la.code}>
                {la.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="businessType">Business type</Label>
          <select
            id="businessType"
            name="businessType"
            defaultValue={defaults.businessType ?? ""}
            className={nativeSelectClass}
          >
            <option value="">All business types</option>
            {businessTypes.map((bt) => (
              <option key={bt.id} value={bt.id}>
                {bt.description}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rating">Rating</Label>
          <select
            id="rating"
            name="rating"
            defaultValue={defaults.rating ?? ""}
            className={nativeSelectClass}
          >
            <option value="">Any rating</option>
            {RATING_KEYS.map((key) => (
              <option key={key} value={key}>
                {ratingLabel(key)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="scheme">Scheme</Label>
          <select
            id="scheme"
            name="scheme"
            defaultValue={defaults.scheme ?? ""}
            className={nativeSelectClass}
          >
            <option value="">FHRS &amp; FHIS</option>
            {SCHEME_TYPES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ratingDateFrom">Rating date from</Label>
          <Input
            id="ratingDateFrom"
            name="ratingDateFrom"
            type="date"
            defaultValue={defaults.ratingDateFrom}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ratingDateTo">Rating date to</Label>
          <Input
            id="ratingDateTo"
            name="ratingDateTo"
            type="date"
            defaultValue={defaults.ratingDateTo}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="sort">Sort by</Label>
          <div className="flex gap-2">
            <select
              id="sort"
              name="sort"
              defaultValue={defaults.sort ?? "business_name"}
              className={nativeSelectClass}
            >
              <option value="business_name">Business name</option>
              <option value="rating">Rating</option>
              <option value="rating_date">Rating date</option>
            </select>
            <select
              name="direction"
              aria-label="Sort direction"
              defaultValue={defaults.direction ?? "asc"}
              className={nativeSelectClass}
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 border-t pt-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="newRatingPending"
            value="true"
            defaultChecked={defaults.newRatingPending === "true"}
            className="size-4 rounded border-input"
          />
          New rating pending only
        </label>

        <NearMeButton
          defaultLat={defaults.lat}
          defaultLon={defaults.lon}
          defaultRadius={defaults.radiusKm}
        />

        <div className="ml-auto flex gap-2">
          <Button type="submit">Search</Button>
          <Button type="button" variant="outline" asChild>
            <Link href="/establishments">Reset</Link>
          </Button>
        </div>
      </div>
    </form>
  );
}
