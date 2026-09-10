import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const sql = fs.readFileSync(path.join(here, '..', 'supabase', 'migrations', '20260911101500_hc_disable_legacy_market_import_api.sql'), 'utf8')

if (!/revoke all on function public\.hc_import_legacy_market_recruitment\(uuid\)[\s\S]*from public, anon, authenticated/i.test(sql)) {
  throw new Error('legacy HM import must not be executable by browser roles')
}
console.log('legacy HM import security contract passed')
