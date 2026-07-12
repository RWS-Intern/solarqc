export function computePriorityScore(
  pipelineStage: string | undefined | null,
  status: string,
): number {
  const stage = pipelineStage ?? 'survey';
  if (stage === 'backend')                              return 0;
  if (stage === 'field_review')                         return 1;
  if (stage === 'documents')                            return 2;
  if (stage === 'proposal')                             return 3;
  if (stage === 'survey' && status === 'in_progress')   return 4;
  if (stage === 'survey' && status === 'blocked')       return 5;
  if (stage === 'survey' && status === 'pending')       return 6;
  if (stage === 'survey' && status === 'completed')     return 7;
  if (stage === 'dropped')                              return 8;
  if (stage === 'completed')                            return 9;
  return 6;
}

// Splits a title into lowercase words for array-contains search.
// "Ansh Gupta" → ["ansh gupta", "ansh", "gupta"]
// The full lowercased title is included so full-phrase searches still work.
export function computeTitleWords(title: string): string[] {
  const lower = title.trim().toLowerCase();
  const words = lower.split(/\s+/).filter((w) => w.length > 0);
  return [...new Set([lower, ...words])];
}
