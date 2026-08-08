import type { QcFieldDefinition, QcAnswer } from '@/types/qc';

export interface SectionGroup {
  key:    string;
  title:  string;
  fields: QcFieldDefinition[];
}

export function groupBySections(template: QcFieldDefinition[]): SectionGroup[] {
  const sorted = [...template].sort((a, b) => a.sortOrder - b.sortOrder);
  const groups: SectionGroup[] = [];
  let current: SectionGroup | null = null;
  for (const field of sorted) {
    if (field.type === 'section_header') {
      current = { key: field.fieldId, title: field.label, fields: [] };
      groups.push(current);
    } else {
      if (!current) {
        current = { key: '__ungrouped', title: 'Checklist', fields: [] };
        groups.push(current);
      }
      current.fields.push(field);
    }
  }
  return groups;
}

// Approval review only (plan §5.4): fails floated to the top of each
// section so the approver sees what needs attention first. Applied on
// top of groupBySections' output, not a parallel reimplementation.
export function sortSectionForReview(
  fields: QcFieldDefinition[],
  answers: Record<string, QcAnswer>,
): QcFieldDefinition[] {
  return [...fields].sort((a, b) => {
    const aFail = answers[a.fieldId]?.status === 'fail';
    const bFail = answers[b.fieldId]?.status === 'fail';
    if (aFail !== bFail) return aFail ? -1 : 1;
    return a.sortOrder - b.sortOrder; // stable within each bucket
  });
}
