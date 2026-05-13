import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseCaseFile } from '../caseStore';
import { runProjection } from '../../engine/projection';

const demoCaseDir = join(process.cwd(), 'examples', 'demo-cases');
const demoCaseFiles = readdirSync(demoCaseDir)
  .filter((file) => file.endsWith('.json'))
  .sort();

describe('demo case files', () => {
  it('has demo full-case files available for adviser walkthroughs', () => {
    expect(demoCaseFiles).toEqual([
      'rip_full_case_demo-isle-of-man_2026-05-12.json',
      'rip_full_case_demo-post-retirement-review_2026-05-12.json',
      'rip_full_case_demo-uk-baseline_2026-05-12.json',
    ]);
  });

  it.each(demoCaseFiles)('%s parses and projects', (file) => {
    const raw = readFileSync(join(demoCaseDir, file), 'utf8');
    const caseFile = parseCaseFile(raw);

    expect(caseFile.schema).toBe('rip.full_case');
    expect(caseFile.version).toBe(1);
    expect(caseFile.case_metadata.case_name).not.toBe('');
    expect(caseFile.config.personal.retirement_date).toMatch(/^\d{4}-\d{2}$/);

    for (const pot of caseFile.config.dc_pots) {
      expect(
        pot.allocation,
        `${file} ${pot.name} should include an adviser-visible allocation`,
      ).toBeDefined();
    }
    for (const account of caseFile.config.tax_free_accounts) {
      expect(
        account.allocation,
        `${file} ${account.name} should include an adviser-visible allocation`,
      ).toBeDefined();
    }

    const projection = runProjection(caseFile.config);
    expect(projection.years.length).toBeGreaterThan(0);
    expect(projection.summary.end_age).toBe(caseFile.config.personal.end_age);
    expect(projection.warnings.every((warning) => warning.includes('exhausted at age'))).toBe(true);
  });
});
