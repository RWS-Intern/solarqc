import { describe, it, expect } from 'vitest';
import { computeQcTally, isFieldVisible } from '@/utils/qcTally';
import type { QcFieldDefinition, QcAnswer } from '@/types/qc';

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

const SECTION   = field({ fieldId: 'sec_1', type: 'section_header' });
const CRITICAL  = field({ fieldId: 'q_1', severity: 'critical' });
const MAJOR     = field({ fieldId: 'q_2', severity: 'major' });
const MINOR     = field({ fieldId: 'q_3', severity: 'minor' });
const PLAIN     = field({ fieldId: 'q_4' });

const TEMPLATE = [SECTION, CRITICAL, MAJOR, MINOR, PLAIN];

describe('computeQcTally', () => {
  it('empty answers: total = non-section field count, everything else zero, suggestedVerdict pass', () => {
    const tally = computeQcTally(TEMPLATE, {});
    expect(tally.total).toBe(4);
    expect(tally.answered).toBe(0);
    expect(tally.pass).toBe(0);
    expect(tally.fail).toBe(0);
    expect(tally.na).toBe(0);
    expect(tally.criticalFail).toBe(0);
    expect(tally.majorFail).toBe(0);
    expect(tally.minorFail).toBe(0);
    expect(tally.suggestedVerdict).toBe('pass');
  });

  it('all points passed: pass = total, suggestedVerdict pass', () => {
    const answers = {
      q_1: answer('q_1', { status: 'pass' }),
      q_2: answer('q_2', { status: 'pass' }),
      q_3: answer('q_3', { status: 'pass' }),
      q_4: answer('q_4', { status: 'pass' }),
    };
    const tally = computeQcTally(TEMPLATE, answers);
    expect(tally.pass).toBe(4);
    expect(tally.answered).toBe(4);
    expect(tally.suggestedVerdict).toBe('pass');
  });

  it('one critical-severity fail alongside other passes: criticalFail 1, suggestedVerdict reject', () => {
    const answers = {
      q_1: answer('q_1', { status: 'fail' }),
      q_2: answer('q_2', { status: 'pass' }),
      q_3: answer('q_3', { status: 'pass' }),
      q_4: answer('q_4', { status: 'pass' }),
    };
    const tally = computeQcTally(TEMPLATE, answers);
    expect(tally.criticalFail).toBe(1);
    expect(tally.fail).toBe(1);
    expect(tally.suggestedVerdict).toBe('reject');
  });

  it('one major fail, zero critical: suggestedVerdict conditional', () => {
    const answers = {
      q_1: answer('q_1', { status: 'pass' }),
      q_2: answer('q_2', { status: 'fail' }),
      q_3: answer('q_3', { status: 'pass' }),
      q_4: answer('q_4', { status: 'pass' }),
    };
    const tally = computeQcTally(TEMPLATE, answers);
    expect(tally.majorFail).toBe(1);
    expect(tally.criticalFail).toBe(0);
    expect(tally.suggestedVerdict).toBe('conditional');
  });

  it('a field whose showIf condition is not met is excluded from total and answered', () => {
    const gated = field({ fieldId: 'q_5', showIf: { fieldId: 'q_4', equals: 'fail' } });
    const template = [...TEMPLATE, gated];
    const answers = {
      q_1: answer('q_1', { status: 'pass' }),
      q_2: answer('q_2', { status: 'pass' }),
      q_3: answer('q_3', { status: 'pass' }),
      q_4: answer('q_4', { status: 'pass' }),   // q_4 is 'pass', not 'fail' -> gate unmet
      q_5: answer('q_5', { status: 'pass' }),   // answered anyway, must still be excluded
    };
    const tally = computeQcTally(template, answers);
    expect(tally.total).toBe(4);      // q_5 excluded
    expect(tally.answered).toBe(4);   // q_5's answer excluded too
    expect(isFieldVisible(gated, answers)).toBe(false);
  });

  it('a field whose showIf condition IS met is included', () => {
    const gated = field({ fieldId: 'q_5', showIf: { fieldId: 'q_4', equals: 'fail' } });
    const template = [...TEMPLATE, gated];
    const answers = {
      q_4: answer('q_4', { status: 'fail' }),
      q_5: answer('q_5', { status: 'pass' }),
    };
    const tally = computeQcTally(template, answers);
    expect(tally.total).toBe(5);
    expect(isFieldVisible(gated, answers)).toBe(true);
  });

  describe('photo_only fields', () => {
    const PHOTO_ONLY = field({ fieldId: 'q_photo', type: 'photo_only', minPhotos: 1 });
    const template = [...TEMPLATE, PHOTO_ONLY];
    const baseAnswers = {
      q_1: answer('q_1', { status: 'pass' }),
      q_2: answer('q_2', { status: 'pass' }),
      q_3: answer('q_3', { status: 'pass' }),
      q_4: answer('q_4', { status: 'pass' }),
    };

    it('counts toward total but not toward answered with zero photos', () => {
      const tally = computeQcTally(template, baseAnswers);
      expect(tally.total).toBe(5);
      expect(tally.answered).toBe(4);
    });

    it('counts toward answered once it meets minPhotos, never toward pass/fail/na', () => {
      const answers = { ...baseAnswers, q_photo: answer('q_photo', { photoUrls: ['https://x/1.jpg'] }) };
      const tally = computeQcTally(template, answers);
      expect(tally.answered).toBe(5);
      expect(tally.pass).toBe(4);   // unchanged — photo_only never joins this count
      expect(tally.fail).toBe(0);
      expect(tally.na).toBe(0);
    });

    it('a critical-severity photo_only field (hypothetical) still cannot produce a criticalFail — no status path exists to reach it', () => {
      const criticalPhotoOnly = field({ fieldId: 'q_photo2', type: 'photo_only', severity: 'critical', minPhotos: 1 });
      const answers = { q_photo2: answer('q_photo2', { photoUrls: ['https://x/1.jpg'] }) };
      const tally = computeQcTally([criticalPhotoOnly], answers);
      expect(tally.criticalFail).toBe(0);
      expect(tally.suggestedVerdict).toBe('pass');
    });

    it('suggestedVerdict is identical whether or not the photo_only field has been touched', () => {
      const withoutPhoto = computeQcTally(template, baseAnswers);
      const withPhoto = computeQcTally(template, { ...baseAnswers, q_photo: answer('q_photo', { photoUrls: ['https://x/1.jpg'] }) });
      expect(withoutPhoto.suggestedVerdict).toBe(withPhoto.suggestedVerdict);
      expect(withoutPhoto.pass).toBe(withPhoto.pass);
      expect(withoutPhoto.criticalFail).toBe(withPhoto.criticalFail);
    });
  });
});
