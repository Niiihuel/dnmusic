import test from 'node:test'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { setTimeout } from 'node:timers/promises'

// Opt-in integration: uses an ephemeral database, no ports, no existing volumes.
// RUN_MESSAGE_DB_TESTS=1 node --test tests/message-actions-db.test.mjs
// Requires the postgres:17 image already present (the test never pulls an image).
test('message actions enforce author, membership, approval, receipts and scrubbing in PostgreSQL', {
  skip: process.env.RUN_MESSAGE_DB_TESTS !== '1', timeout: 30000,
}, async () => {
  const container = `dnmusic-message-actions-test-${process.pid}`
  const docker = (args, input) => execFileSync('docker', args, { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'] })
  docker(['run', '--pull=never', '--rm', '-d', '--name', container, '--network=none',
    '--tmpfs', '/var/lib/postgresql/data', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:17'])
  try {
    // PostgreSQL inicia primero un servidor temporal sólo por socket durante initdb.
    // Esperar TCP evita aceptar ese servidor justo antes de que se reinicie.
    for (let attempt = 0; ; attempt++) {
      try { docker(['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']); break } catch (error) {
        if (attempt >= 60) throw error
        await setTimeout(250)
      }
    }
    const sql = ['tests/sql/message-actions-fixture.sql', 'supabase/migrations/20260924000000_message_actions.sql',
      'tests/sql/message-actions-assertions.sql'].map(path => readFileSync(path, 'utf8')).join('\n')
    docker(['exec', '-i', container, 'psql', '-h', '127.0.0.1', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q'], sql)
  } finally { docker(['rm', '-f', container]) }
})
