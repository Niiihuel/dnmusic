import { createClient } from '@supabase/supabase-js'
import { auditStorageBudget } from './storage-budget.js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')

const apply = process.argv.includes('--apply')
const supabase = createClient(url, key, { auth: { persistSession: false } })
const plan = await auditStorageBudget(supabase, 0, { apply })
const mib = (bytes: number) => Number((bytes / 1024 / 1024).toFixed(2))

console.log(JSON.stringify({
  mode: apply ? 'cleanup' : 'audit',
  allowed: plan.allowed,
  totalMiB: mib(plan.totalBytes),
  removableMiB: mib(plan.deletedBytes),
  projectedMiB: mib(plan.projectedBytes),
  objectsToRemove: plan.deletions.length,
  hardLimitMiB: mib(plan.hardLimitBytes),
  targetMiB: mib(plan.targetBytes),
}, null, 2))
