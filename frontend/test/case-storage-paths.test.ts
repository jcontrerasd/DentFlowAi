import { describe, expect, it } from 'vitest';
import {
  caseStoragePrefix,
  collectCaseStoragePaths,
} from '@/lib/cases/caseStoragePaths';

describe('caseStoragePaths', () => {
  it('collectCaseStoragePaths deduplica gcs y thumbnail', () => {
    const paths = collectCaseStoragePaths([
      { gcsPath: 'org/a.stl', thumbnailPath: 'org/a-thumb.png' },
      { gcsPath: 'org/a.stl', thumbnailPath: null },
    ]);
    expect(paths).toHaveLength(2);
    expect(paths).toContain('org/a.stl');
    expect(paths).toContain('org/a-thumb.png');
  });

  it('caseStoragePrefix sigue convención organizations/.../cases/', () => {
    expect(caseStoragePrefix('org-1', 'case-1')).toBe(
      'organizations/org-1/cases/case-1/',
    );
  });
});
