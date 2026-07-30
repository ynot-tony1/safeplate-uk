/** Next.js server components receive searchParams as string | string[] | undefined per key. */
export function flattenSearchParams(
  sp: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(sp)) {
    if (value == null) continue;
    const first = Array.isArray(value) ? value[0] : value;
    if (first != null && first !== "") out[key] = first;
  }
  return out;
}
