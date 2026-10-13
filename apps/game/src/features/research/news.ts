/**
 * The blueprints in `known` that were not in `seen`, in order: what was learned since the last read.
 * Nothing on the first read, which only sees what is known already, nor after a load that knows
 * less than before.
 */
export function learnedSince(
  seen: readonly string[] | undefined,
  known: readonly string[],
): readonly string[] {
  if (seen === undefined || !seen.every((id) => known.includes(id))) return [];
  return known.filter((id) => !seen.includes(id));
}
