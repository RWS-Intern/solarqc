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

  it('a non-DCR job (moduleType omitted) has no panel issues even with no panels', () => {
    const issues = validateQcJob([], {}, SIGN_OFF, true);
    expect(issues.some((i) => i.code === 'panel_incomplete')).toBe(false);
  });

  it('a DCR job with no panels yet produces one job-level panel_incomplete issue', () => {
    const issues = validateQcJob([], {}, SIGN_OFF, true, 'dcr', undefined);
    expect(issues.filter((i) => i.code === 'panel_incomplete')).toHaveLength(1);
    expect(issues[0].fieldId).toBeUndefined();
  });

  it('a DCR panel missing a serial or a photo produces a panel_incomplete issue for that panel only', () => {
    const panels = [
      { serialNumber: 'SN-1', photoUrl: 'https://x/1.jpg' },
      { serialNumber: '',     photoUrl: 'https://x/2.jpg' },
      { serialNumber: 'SN-3', photoUrl: '' },
    ];
    const issues = validateQcJob([], {}, SIGN_OFF, true, 'dcr', panels);
    const panelIssues = issues.filter((i) => i.code === 'panel_incomplete');
    expect(panelIssues).toHaveLength(2);
    expect(panelIssues.map((i) => i.fieldId)).toEqual(['panel_1', 'panel_2']);
  });

  it('a DCR job with every panel complete has zero panel issues', () => {
    const panels = [
      { serialNumber: 'SN-1', photoUrl: 'https://x/1.jpg' },
      { serialNumber: 'SN-2', photoUrl: 'https://x/2.jpg' },
    ];
    const issues = validateQcJob([], {}, SIGN_OFF, true, 'dcr', panels);
    expect(issues.some((i) => i.code === 'panel_incomplete')).toBe(false);
  });

  describe('photo_only fields', () => {
    it('a required photo_only field with zero photos produces exactly one photo_required issue, never a required issue', () => {
      const template = [field({ fieldId: 'q_photo', type: 'photo_only', isRequired: true, minPhotos: 1 })];
      const issues = validateQcJob(template, {}, SIGN_OFF, true);
      expect(issues.filter((i) => i.fieldId === 'q_photo')).toHaveLength(1);
      expect(issues[0].code).toBe('photo_required');
    });

    it('a required photo_only field with enough photos has no issue', () => {
      const template = [field({ fieldId: 'q_photo', type: 'photo_only', isRequired: true, minPhotos: 1 })];
      const answers = { q_photo: answer('q_photo', { photoUrls: ['https://x/1.jpg'] }) };
      const issues = validateQcJob(template, answers, SIGN_OFF, true);
      expect(issues.some((i) => i.fieldId === 'q_photo')).toBe(false);
    });

    it('a required photo_only field below minPhotos still produces the issue even with one photo attached', () => {
      const template = [field({ fieldId: 'q_photo', type: 'photo_only', isRequired: true, minPhotos: 2 })];
      const answers = { q_photo: answer('q_photo', { photoUrls: ['https://x/1.jpg'] }) };
      const issues = validateQcJob(template, answers, SIGN_OFF, true);
      expect(issues.some((i) => i.fieldId === 'q_photo' && i.code === 'photo_required')).toBe(true);
    });

    it('a non-required photo_only field with zero photos produces no issue', () => {
      const template = [field({ fieldId: 'q_photo', type: 'photo_only', isRequired: false, minPhotos: 1 })];
      const issues = validateQcJob(template, {}, SIGN_OFF, true);
      expect(issues.some((i) => i.fieldId === 'q_photo')).toBe(false);
    });

    it('a photo_only field is never flagged remark_required or photo_required_on_fail — it has no fail state', () => {
      const template = [field({ fieldId: 'q_photo', type: 'photo_only', isRequired: true, minPhotos: 1 })];
      const answers = { q_photo: answer('q_photo', { photoUrls: ['https://x/1.jpg'] }) };
      const issues = validateQcJob(template, answers, SIGN_OFF, true);
      expect(issues.some((i) => i.code === 'remark_required' || i.code === 'photo_required_on_fail')).toBe(false);
    });
  });
});
