import {
  doc, getDoc, updateDoc, arrayUnion,
  type Firestore,
} from 'firebase/firestore';

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

export async function resolveAndAutoAddStateDistrict(
  db: Firestore,
  state: string,
  district: string,
): Promise<{ resolvedState: string; resolvedDistrict: string }> {
  const configRef  = doc(db, 'appConfig', 'global');
  const configSnap = await getDoc(configRef);
  const existingDistrictsByState = (configSnap.data()?.['districtsByState'] as Record<string, string[]>) ?? {};
  const existingFlatDistricts    = (configSnap.data()?.['districts']        as string[])                 ?? [];
  const existingStates           = Object.keys(existingDistrictsByState);

  const resolvedState            = state.trim()    ? resolveDistrictCasing(state.trim(),    existingStates)           : '';
  const existingDistrictsForState = existingDistrictsByState[resolvedState] ?? [];
  const resolvedDistrict         = district.trim() ? resolveDistrictCasing(district.trim(), existingDistrictsForState) : '';

  const updates: Record<string, unknown> = {};

  // Add new state key (empty array) if state is new
  if (resolvedState && !existingDistrictsByState[resolvedState]) {
    updates[`districtsByState.${resolvedState}`] = [];
  }

  // Add district under the state if it's new for that state
  if (resolvedState && resolvedDistrict && !existingDistrictsForState.some(
    (d) => d.toLowerCase() === resolvedDistrict.toLowerCase(),
  )) {
    updates[`districtsByState.${resolvedState}`] = arrayUnion(resolvedDistrict);
  }

  // Keep flat districts list in sync
  if (resolvedDistrict && !existingFlatDistricts.some(
    (d) => d.toLowerCase() === resolvedDistrict.toLowerCase(),
  )) {
    updates['districts'] = arrayUnion(resolvedDistrict);
  }

  if (Object.keys(updates).length > 0) {
    updateDoc(configRef, updates).catch((err) =>
      console.error('[resolveAndAutoAddStateDistrict] failed:', err));
  }

  return { resolvedState, resolvedDistrict };
}
