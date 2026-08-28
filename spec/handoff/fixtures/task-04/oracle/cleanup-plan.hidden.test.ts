import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

it('keeps protected evidence and refuses static-only deletion', () => {
  const path = process.env.TEST_STEWARD_CLEANUP_PLAN;
  if (!path) throw new Error('TEST_STEWARD_CLEANUP_PLAN is required');
  const plan = JSON.parse(readFileSync(path, 'utf8'));

  const candidates = plan.candidates as Array<any>;
  const protectedCandidate = candidates.find((candidate) =>
    candidate.test_paths.includes('test/webhook-contract.test.ts'));
  expect(protectedCandidate?.action).not.toBe('DELETE_CANDIDATE');

  const duplicate = candidates.find((candidate) =>
    candidate.test_paths.includes('test/email-normalize.test.ts') &&
    candidate.test_paths.includes('test/email-normalize-copy.test.ts'));
  expect(duplicate).toBeTruthy();

  for (const candidate of candidates.filter((item) => item.action === 'DELETE_CANDIDATE')) {
    expect(candidate.structural_signals.length).toBeGreaterThan(0);
    expect(candidate.independent_signals.length).toBeGreaterThan(0);
    expect(candidate.protected_checks.every((check: any) => check.passed === true)).toBe(true);
    expect(candidate.human_approval.required).toBe(true);
  }

  const similar = candidates.find((candidate) =>
    candidate.test_paths.includes('test/email-normalize-similar.test.ts'));
  if (similar && similar.independent_signals.length === 0) {
    expect(['MERGE_CANDIDATE', 'INSUFFICIENT_EVIDENCE', 'KEEP']).toContain(similar.action);
  }
});
