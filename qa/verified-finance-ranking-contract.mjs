import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const repo = read('src/lib/recruitRepository.ts');
const rankedCatalog = read('supabase/migrations/20260913090000_hc_jobseeker_ranked_catalog_v1.sql');
const checks = [
  [repo.includes("rpc('hc_jobseeker_list_ranked_jobs')"), 'job search must use the candidate-safe ranked catalog RPC'],
  [rankedCatalog.includes('hc_public_finance_profiles'), 'ranked catalog must read only the public HF verified profile'],
  [repo.includes("source: 'hf_verified'"), 'HF metrics must retain verified source provenance'],
  [repo.includes('verified_finance: VerifiedFinanceProfile | null'), 'jobs must carry public HF verified data'],
  [repo.includes("Number(a.verified_finance?.quality_points || 0)"), 'organic ranking fallback must include HF public quality points'],
  [!repo.includes("from('hc_verified_finance_snapshots')") && !rankedCatalog.includes('hc_verified_finance_snapshots'), 'jobseeker client/catalog must never read raw HF snapshots'],
];
const failed = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failed.length) {
  console.error('HF verified ranking contract failed:\n- ' + failed.join('\n- '));
  process.exit(1);
}
console.log(`HF verified ranking contract passed (${checks.length} checks).`);
