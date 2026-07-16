export function toTitleCase(input: string): string {
  return input
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export function resolveDistrictCasing(input: string, existingDistricts: string[]): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  const match = existingDistricts.find(
    (d) => d.toLowerCase() === trimmed.toLowerCase(),
  );
  if (match) return match;
  return toTitleCase(trimmed);
}
