import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const repo = fs.readFileSync(path.join(root, 'src/lib/recruitRepository.ts'), 'utf8');
const checks = [
  [repo.includes("from('hc_public_finance_profiles')"), 'job search must read only the public HF verified profile'],
  [repo.includes("source: 'hf_verified'"), 'HF metrics must retain verified source provenance'],
  [repo.includes('verified_finance: financeProfiles.get'), 'jobs must carry public HF verified data'],
  [repo.includes("Number(a.verified_finance?.quality_points || 0)"), 'organic ranking must include HF public quality points'],
  [!repo.includes("from('hc_verified_finance_snapshots')"), 'jobseeker client must never read raw HF snapshots'],
];
const failed = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failed.length) {
  console.error('HF verified ranking contract failed:\n- ' + failed.join('\n- '));
  process.exit(1);
}
console.log(`HF verified ranking contract passed (${checks.length} checks).`);
