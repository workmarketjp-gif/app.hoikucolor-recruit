import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const app = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8');
const summary = fs.readFileSync(path.join(root, 'src/components/VerifiedFinanceSummary.tsx'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src/components/VerifiedFinanceSummary.css'), 'utf8');
const repository = fs.readFileSync(path.join(root, 'src/lib/recruitRepository.ts'), 'utf8');

const checks = [
  [repository.includes("from('hc_public_finance_profiles')"), 'jobseeker app must read only the public HF verified profile'],
  [!repository.includes("from('hc_verified_finance_snapshots')"), 'jobseeker app must never read raw HF verified snapshots'],
  [app.includes('<VerifiedFinanceSummary job={job} expanded={expanded} />'), 'job details must render HF verified data'],
  [app.includes('✓ Hoiku Finance 実績'), 'job cards must identify HF verified provenance'],
  [app.includes('HF実績データあり'), 'job search must expose an HF verified filter'],
  [app.includes('job.verified_finance?.verified_metric_count'), 'HF filter and badges must depend on actually published metrics'],
  [summary.includes("source") || summary.includes('Hoiku Finance'), 'summary must identify Hoiku Finance as the data source'],
  [summary.includes('園の申告値ではなくHoiku Financeの確定済み実績から自動集計'), 'verified values must be explicitly separated from facility-declared values'],
  [summary.includes('信用力・支払能力・将来の経営継続を保証するものではありません'), 'monthly stability must not be presented as solvency or a guarantee'],
  [css.includes('@media (max-width: 720px)'), 'HF verified presentation must include mobile layout rules'],
];

const failed = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failed.length) {
  console.error('HC HF verified display contract failed:\n- ' + failed.join('\n- '));
  process.exit(1);
}
console.log(`HC HF verified display contract passed (${checks.length} checks).`);
