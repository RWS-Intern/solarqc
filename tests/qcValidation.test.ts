import { describe, it, expect } from 'vitest';
import { validateQcJob } from '@/utils/qcValidation';
import type { QcFieldDefinition, QcAnswer, SignOff } from '@/types/qc';

function field(overrides: Partial<QcFieldDefinition> & { fieldId: string }): QcFieldDefinition {
  return {
    label: overrides.fieldId, type: 'passfail', sortOrder: 0,
    isRequired: false, options: [],
    ...overrides,
  };
}

function answer(fieldId: string, overrides: Partial<QcAnswer> = {}): QcAnswer {
  return {
    fieldId, status: null, remark: '', photoUrls: [],
    answeredAt: null, answeredBy: '', round: 0,
    ...overrides,
  };
}

const SIGN_OFF: SignOff = {
  role: 'inspector', name: 'Test Inspector', uid: 'insp-1',
  signatureUrl: 'https://example.com/sig.png', signedAt: new Date(),
  location: null, deviceInfo: '', declaration: 'I certify...',
};

describe('validateQcJob', () => {
  it('a required field with no answer produces exactly one required issue, not also a photo/remark issue', () => {
    const template = [field({ fieldId: 'q_1', isRequired: true, photoRequired: true })];
    const issues = validateQcJob(template, {}, SIGN_OFF, true);
    const forField = issues.filter((i) => i.fieldId === 'q_1');
    expect(forField).toHaveLength(1);
    expect(forField[0].code).toBe('required');
  });

  it('a photoRequired field answered pass with zero photos produces a photo_required issue', () => {
    const template = [field({ fieldId: 'q_1', photoRequired: true, minPhotos: 1 })];
    const answers = { q_1: answer('q_1', { status: 'pass', photoUrls: [] }) };
    const issues = validateQcJob(template, answers, SIGN_OFF, true);
    expect(issues.some((i) => i.fieldId === 'q_1' && i.code === 'photo_required')).toBe(true);
  });

  it('a photoRequired field answered pass with enough photos has no photo_required issue', () => {
    const template = [field({ fieldId: 'q_1', photoRequired: true, minPhotos: 1 })];
    const answers = { q_1: answer('q_1', { status: 'pass', photoUrls: ['https://x/1.jpg'] }) };
    const issues = validateQcJob(template, answers, SIGN_OFF, true);
    expect(issues.some((i) => i.fieldId === 'q_1' && i.code === 'photo_required')).toBe(false);
  });

  it('a field failed with remarkRequiredOnFail and an empty remark produces remark_required; a non-empty remark clears it', () => {
    const template = [field({ fieldId: 'q_1', remarkRequiredOnFail: true })];

    const withEmptyRemark = { q_1: answer('q_1', { status: 'fail', remark: '' }) };
    const issuesEmpty = validateQcJob(template, withEmptyRemark, SIGN_OFF, true);
    expect(issuesEmpty.some((i) => i.fieldId === 'q_1' && i.code === 'remark_required')).toBe(true);

    const withRemark = { q_1: answer('q_1', { status: 'fail', remark: 'Needs re-torque.' }) };
    const issuesFilled = validateQcJob(template, withRemark, SIGN_OFF, true);
    expect(issuesFilled.some((i) => i.fieldId === 'q_1' && i.code === 'remark_required')).toBe(false);
  });

  it('a field failed with photoRequiredOnFail and zero photos produces photo_required_on_fail', () => {
    const template = [field({ fieldId: 'q_1', photoRequiredOnFail: true })];
    const answers = { q_1: answer('q_1', { status: 'fail', photoUrls: [] }) };
    const issues = validateQcJob(template, answers, SIGN_OFF, true);
    expect(issues.some((i) => i.fieldId === 'q_1' && i.code === 'photo_required_on_fail')).toBe(true);
  });

  it('no inspectorSignOff produces signature_missing; declarationAccepted false produces declaration_unchecked — both present even with an otherwise-clean sheet', () => {
    const issues = validateQcJob([], {}, null, false);
    expect(issues.some((i) => i.code === 'signature_missing')).toBe(true);
    expect(issues.some((i) => i.code === 'declaration_unchecked')).toBe(true);
  });

  it('a signed-off, declared, fully-answered job has zero issues', () => {
    const template = [field({ fieldId: 'q_1', isRequired: true })];
    const answers = { q_1: answer('q_1', { status: 'pass' }) };
    const issues = validateQcJob(template, answers, SIGN_OFF, true);
    expect(issues).toHaveLength(0);
  });

  it('a field whose showIf condition is not met is excluded from the required-check entirely', () => {
    const gate = field({ fieldId: 'q_1' });
    const gated = field({ fieldId: 'q_2', isRequired: true, showIf: { fieldId: 'q_1', equals: 'fail' } });
    const template = [gate, gated];
    // q_1 is 'pass', not 'fail' -> q_2's gate is unmet, q_2 unanswered but must NOT be flagged
    const answers = { q_1: answer('q_1', { status: 'pass' }) };
    const issues = validateQcJob(template, answers, SIGN_OFF, true);
    expect(issues.some((i) => i.fieldId === 'q_2')).toBe(false);
  });

  it('section_header rows are never validated', () => {
    const template = [field({ fieldId: 'sec_1', type: 'section_header', isRequired: true })];
    const issues = validateQcJob(template, {}, SIGN_OFF, true);
    expect(issues.some((i) => i.fieldId === 'sec_1')).toBe(false);
  });
});
