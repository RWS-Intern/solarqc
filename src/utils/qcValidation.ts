import type { QcFieldDefinition, QcAnswer, QcJob } from '@/types/qc';
import { isFieldVisible } from './qcTally';

export interface QcValidationIssue {
  fieldId?: string;  // undefined = job-level, not tied to one check point
  code:     'required' | 'photo_required' | 'remark_required'
          | 'photo_required_on_fail' | 'signature_missing' | 'declaration_unchecked';
  message:  string;
}

export function validateQcJob(
  template:            QcFieldDefinition[],
  answers:             Record<string, QcAnswer>,
  inspectorSignOff:    QcJob['inspectorSignOff'],
  declarationAccepted: boolean,
): QcValidationIssue[] {
  const issues: QcValidationIssue[] = [];

  for (const field of template) {
    if (field.type === 'section_header') continue;
    if (!isFieldVisible(field, answers)) continue;
    const ans = answers[field.fieldId];

    if (field.isRequired) {
      const answered = !!ans && (
        ans.status === 'pass' || ans.status === 'fail' || ans.status === 'na'
        || !!ans.value || ans.numericValue !== undefined
      );
      if (!answered) {
        issues.push({
          fieldId: field.fieldId, code: 'required',
          message: `${field.code ? field.code + ' — ' : ''}${field.label} is required.`,
        });
        continue; // an unanswered field can't also be missing a photo/remark yet
      }
    }
    if (!ans) continue;

    const photoCount = ans.photoUrls?.length ?? 0;
    if (field.photoRequired && photoCount < (field.minPhotos ?? 1)) {
      issues.push({
        fieldId: field.fieldId, code: 'photo_required',
        message: `${field.label} needs at least ${field.minPhotos ?? 1} photo(s).`,
      });
    }
    if (ans.status === 'fail') {
      if (field.remarkRequiredOnFail && !ans.remark?.trim()) {
        issues.push({
          fieldId: field.fieldId, code: 'remark_required',
          message: `${field.label}: a remark is required for a Fail.`,
        });
      }
      if (field.photoRequiredOnFail && photoCount === 0) {
        issues.push({
          fieldId: field.fieldId, code: 'photo_required_on_fail',
          message: `${field.label}: a photo is required for a Fail.`,
        });
      }
    }
  }

  // Job-level checks Phase 5's submit gate needs. Building the complete
  // function now — rather than a checklist-only version Phase 5 has to
  // come back and extend — costs nothing, since it's a pure function.
  // What Phase 4's OWN UI does with these two specific issues is
  // different: see QcFillPage's footer-counter note. Neither is fixable
  // from this phase's UI, so neither should count toward what this
  // phase tells the inspector they still need to do.
  if (!inspectorSignOff) {
    issues.push({ code: 'signature_missing', message: 'Inspector signature is required.' });
  }
  if (!declarationAccepted) {
    issues.push({ code: 'declaration_unchecked', message: 'The declaration must be checked.' });
  }

  return issues;
}
