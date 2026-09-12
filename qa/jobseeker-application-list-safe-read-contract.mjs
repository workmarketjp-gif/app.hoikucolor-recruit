import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const repo = fs.readFileSync(path.join(root, 'src', 'lib', 'recruitRepository.ts'), 'utf8');

const listFunction = repo.match(/export async function listApplications\(\): Promise<Application\[]> \{([\s\S]*?)\n\}/);
if (!listFunction) throw new Error('listApplications implementation not found');

const body = listFunction[1];
if (!/\.rpc\('hc_jobseeker_list_applications'\)/.test(body)) {
  throw new Error('listApplications must use hc_jobseeker_list_applications');
}
if (/\.from\('hc_applications'\)/.test(body)) {
  throw new Error('listApplications must not directly read hc_applications');
}
if (/admin_memo|hired_staff_id|organization_id|jobseeker_clerk_user_id/.test(body)) {
  throw new Error('listApplications must not request internal application fields');
}

console.log('jobseeker application list safe-read contract passed');
