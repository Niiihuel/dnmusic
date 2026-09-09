/** Existing local DB, one connection, atomic migration+tests+ROLLBACK. No reset or remote URL. */
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
const container = process.argv[2] ?? 'supabase_db_dany'
if (!/^supabase_db_[a-zA-Z0-9_-]+$/.test(container)) throw new Error('Expected a local Supabase DB container name.')
const migration = readFileSync(new URL('../supabase/migrations/20260919000000_update_policies.sql', import.meta.url), 'utf8')
const tests = readFileSync(new URL('../supabase/tests/update_policies.sql', import.meta.url), 'utf8')
if (!migration.includes('\nbegin;\n') || !migration.endsWith('commit;\n')) throw new Error('Unexpected migration transaction boundaries.')
const body = migration.replace('\nbegin;\n', '\n').replace(/commit;\n$/, '')
const sql = `begin;\nset local statement_timeout='20s';\nset local lock_timeout='3s';\n${body}\n${tests}\nrollback;\nselect to_regclass('app_private.update_policies') is null as migration_rolled_back;\n`
const result = spawnSync('docker', ['exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 })
if (result.error) throw result.error
if (result.status !== 0) { process.stderr.write(result.stderr); process.exit(result.status ?? 1) }
process.stdout.write(result.stdout.slice(result.stdout.lastIndexOf('result') - 10))
