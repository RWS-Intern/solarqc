import type { QcFieldDefinition, QcAnswer, QcJob, QcVerdict } from '@/types/qc';

// Shared by tally, validation, and the fill screen's own rendering — a
// field with a showIf condition is only "in play" if that condition is
// currently met. Nothing in the delivered template sets showIf yet
// (qcTemplateSeed.ts's own header flags this as a TODO for sections 5/6),
// but Phase 2's TemplateEditor already lets an admin add one, so this
// needs to be correct now rather than revisited later.
export function isFieldVisible(
  field: QcFieldDefinition,
  answers: Record<string, QcAnswer>,
): boolean {
  if (!field.showIf) return true;
  const target = answers[field.showIf.fieldId];
  if (!target) return false;
  return target.status === field.showIf.equals || target.value === field.showIf.equals;
}

export function computeQcTally(
  template: QcFieldDefinition[],
  answers: Record<string, QcAnswer>,
): QcJob['tally'] {
  const checkPoints = template.filter(
    (f) => f.type !== 'section_header' && isFieldVisible(f, answers),
  );

  let answered = 0, pass = 0, fail = 0, na = 0;
  let criticalFail = 0, majorFail = 0, minorFail = 0;

  for (const field of checkPoints) {
    const ans = answers[field.fieldId];
    if (!ans) continue;

    const hasStatus = ans.status === 'pass' || ans.status === 'fail' || ans.status === 'na';
    const hasValue  = (ans.value !== undefined && ans.value !== '') || ans.numericValue !== undefined;
    if (!hasStatus && !hasValue) continue;

    answered++;
    if (ans.status === 'pass') pass++;
    else if (ans.status === 'na') na++;
    else if (ans.status === 'fail') {
      fail++;
      if (field.severity === 'critical') criticalFail++;
      else if (field.severity === 'major') majorFail++;
      else if (field.severity === 'minor') minorFail++;
    }
  }

  // Advisory only — never gates anything, per the plan's decisions section.
  // Any critical fail suggests reject; any fail at all (with no critical)
  // suggests conditional; a clean sheet suggests pass. This exact
  // three-tier heuristic isn't spelled out verbatim in the plan, but it's
  // what §5.4's mockup example ("Suggested: REJECT — 2 critical fails")
  // implies, and it's the simplest rule that matches it.
  const suggestedVerdict: QcVerdict =
    criticalFail > 0 ? 'reject' : fail > 0 ? 'conditional' : 'pass';

  return {
    total: checkPoints.length, answered, pass, fail, na,
    criticalFail, majorFail, minorFail, suggestedVerdict,
  };
}
