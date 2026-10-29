import fs from 'node:fs'
import {transformSync} from 'esbuild'
// Export only the schema serializer; the PGlite Auth shim is test infrastructure.
const url=new URL('../../lib/testing/audited-database.ts',import.meta.url)
const source=fs.readFileSync(url,'utf8').split('export const TEST_USERS')[0]
  .replace(/^import .*@electric-sql.*\n/gm,'')
  .replaceAll('import.meta.url',JSON.stringify(url.href))
const {auditedPublicSql}=await import('data:text/javascript;base64,'+Buffer.from(transformSync(source,{loader:'ts',format:'esm'}).code).toString('base64'))
const target=new URL('../../supabase/baselines/20261004_public.sql',import.meta.url)
fs.writeFileSync(target,'-- Audited public schema at 0a2bc72, without business or Auth user data.\n-- For a NEW isolated Supabase project only; then apply all *_audit_* migrations.\n'+auditedPublicSql()+'\n')
console.log('Exported audited baseline without user data')
