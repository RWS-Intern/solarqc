import type { Task, SaleClosedConfig, SaleClosedFieldMap } from '@/types';

// Returns true if a single field-set (either survey or documents) has
// ALL THREE advance-payment fields present: type, amount, and image.
function hasAllThree(
  map:      SaleClosedFieldMap,
  answers:  Record<string, { value?: string } | string> | undefined,
  photos:   Record<string, string[]> | undefined,
): boolean {
  if (!map.typeFieldId || !map.amountFieldId || !map.imageFieldId) return false;

  // Answers can be either { value: string } (survey) or plain string (documents)
  const readAnswer = (fid: string): string => {
    const raw = answers?.[fid];
    if (raw == null) return '';
    if (typeof raw === 'string') return raw.trim();
    return (raw.value ?? '').toString().trim();
  };

  const typeVal   = readAnswer(map.typeFieldId);
  const amountVal = readAnswer(map.amountFieldId);
  const imageArr  = photos?.[map.imageFieldId];
  const hasImage  = Array.isArray(imageArr) && imageArr.length > 0;

  return typeVal !== '' && amountVal !== '' && hasImage;
}

/**
 * Pure computation of whether a lead qualifies as "sale closed" by evidence.
 * - Checks BOTH the survey field-set and the documents field-set.
 * - Qualifies if EITHER set has all three advance-payment fields filled.
 * - Does NOT consider pipelineStage here (dropped-exclusion and manual
 *   override are handled by the caller, not this pure function).
 */
export function computeSaleClosedEvidence(
  task:   Pick<Task, 'fieldAnswers' | 'fieldPhotos' | 'documentAnswers' | 'documentPhotos'>,
  config: SaleClosedConfig | undefined,
): boolean {
  if (!config) return false;

  const surveyQualifies = hasAllThree(
    config.survey,
    task.fieldAnswers as Record<string, { value?: string }> | undefined,
    task.fieldPhotos,
  );

  const documentsQualifies = hasAllThree(
    config.documents,
    task.documentAnswers as Record<string, string> | undefined,
    task.documentPhotos,
  );

  return surveyQualifies || documentsQualifies;
}
