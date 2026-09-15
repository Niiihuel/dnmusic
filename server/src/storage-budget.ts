import type { SupabaseClient } from '@supabase/supabase-js'

const MIB = 1024 * 1024
const DEFAULT_HARD_LIMIT = 850 * MIB
const DEFAULT_TARGET = 800 * MIB
const DEFAULT_GRACE_MS = 6 * 60 * 60 * 1000
const PAGE_SIZE = 1000

const MANAGED_BUCKETS = ['songs', 'artwork', 'covers', 'avatars', 'showcases', 'decoraciones'] as const

export type StorageFile = {
  bucket: string
  name: string
  bytes: number
  createdAt: number
}

export type StorageReferences = {
  audio: Set<string>
  artwork: Set<string>
  covers: Set<string>
}

export type StorageBudgetOptions = {
  hardLimitBytes?: number
  targetBytes?: number
  graceMs?: number
  now?: number
}

export type StorageBudgetPlan = {
  allowed: boolean
  totalBytes: number
  incomingBytes: number
  projectedBytes: number
  deletedBytes: number
  deletions: StorageFile[]
  hardLimitBytes: number
  targetBytes: number
}

export class StorageBudgetError extends Error {
  readonly code = 'STORAGE_BUDGET_EXCEEDED'

  constructor(readonly plan: StorageBudgetPlan) {
    super('No hay espacio seguro para guardar este archivo. Se conservó la reserva necesaria para iniciar sesión.')
    this.name = 'StorageBudgetError'
  }
}

function positiveEnv(name: string, fallback: number): number {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? Math.floor(value * MIB) : fallback
}

function normalizedOptions(options: StorageBudgetOptions = {}) {
  const hardLimitBytes = options.hardLimitBytes ?? positiveEnv('STORAGE_HARD_LIMIT_MB', DEFAULT_HARD_LIMIT)
  const requestedTarget = options.targetBytes ?? positiveEnv('STORAGE_TARGET_MB', DEFAULT_TARGET)
  return {
    hardLimitBytes,
    targetBytes: Math.min(requestedTarget, hardLimitBytes),
    graceMs: options.graceMs ?? DEFAULT_GRACE_MS,
    now: options.now ?? Date.now(),
  }
}

function normalizePath(value: unknown, bucket: string): string | null {
  if (typeof value !== 'string') return null
  let path = value.trim().replace(/^\/+/, '')
  if (!path || path.includes('://')) return null
  if (path.startsWith(`${bucket}/`)) path = path.slice(bucket.length + 1)
  return path || null
}

function addReference(set: Set<string>, value: unknown, bucket: string) {
  const path = normalizePath(value, bucket)
  if (path) set.add(path)
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function evictionPriority(file: StorageFile, refs: StorageReferences, graceMs: number, now: number) {
  if (!Number.isFinite(file.createdAt) || now - file.createdAt < graceMs) return null

  if (file.bucket === 'songs') {
    if (file.name.startsWith('picos/') || file.name.startsWith('aportes/')) return 0
    // La primera forma es una cuarentena de subida. `propias/<uuid>.<ext>` es
    // el archivo durable de una persona y nunca se elimina automáticamente.
    if (/^propias\/[^/]+\/.+/.test(file.name)) return 0
    if (file.name.startsWith('propias/')) return null
    if (refs.audio.has(file.name)) return null
    return 2
  }

  if (file.bucket === 'artwork') {
    // Las tapas extraídas de archivos propios son contenido del usuario.
    if (file.name.startsWith('propia-') || refs.artwork.has(file.name)) return null
    return 1
  }

  // Avatares, vitrinas, decoraciones y portadas subidas por personas son
  // contenido durable. El límite impide nuevas subidas, pero no las borra.
  return null
}

export function planStorageBudget(
  files: StorageFile[],
  references: StorageReferences,
  incomingBytes = 0,
  options: StorageBudgetOptions = {},
): StorageBudgetPlan {
  const { hardLimitBytes, targetBytes, graceMs, now } = normalizedOptions(options)
  const totalBytes = files.reduce((total, file) => total + Math.max(0, file.bytes), 0)
  const incoming = Math.max(0, incomingBytes)
  const desired = Math.min(targetBytes, Math.max(0, hardLimitBytes - incoming))
  let projectedBytes = totalBytes + incoming
  let deletedBytes = 0
  const deletions: StorageFile[] = []

  if (projectedBytes > targetBytes) {
    const candidates = files
      .map((file) => ({ file, priority: evictionPriority(file, references, graceMs, now) }))
      .filter((item): item is { file: StorageFile; priority: number } => item.priority !== null)
      .sort((a, b) => a.priority - b.priority || a.file.createdAt - b.file.createdAt)

    for (const { file } of candidates) {
      if (totalBytes - deletedBytes <= desired) break
      deletions.push(file)
      deletedBytes += Math.max(0, file.bytes)
    }
    projectedBytes = totalBytes - deletedBytes + incoming
  }

  return {
    allowed: projectedBytes <= hardLimitBytes,
    totalBytes,
    incomingBytes: incoming,
    projectedBytes,
    deletedBytes,
    deletions,
    hardLimitBytes,
    targetBytes,
  }
}

async function listBucket(supabase: SupabaseClient, bucket: string): Promise<StorageFile[]> {
  const files: StorageFile[] = []
  const pending = ['']
  const visited = new Set<string>()

  while (pending.length) {
    const prefix = pending.shift()!
    if (visited.has(prefix)) continue
    visited.add(prefix)

    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await supabase.storage.from(bucket).list(prefix, {
        limit: PAGE_SIZE,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      })
      if (error) throw new Error(`No se pudo inventariar ${bucket}/${prefix}: ${error.message}`)

      const page = data ?? []
      for (const entry of page) {
        const name = prefix ? `${prefix}/${entry.name}` : entry.name
        if (entry.id && entry.metadata) {
          files.push({
            bucket,
            name,
            bytes: Math.max(0, Number(entry.metadata.size) || 0),
            createdAt: Date.parse(entry.created_at ?? entry.updated_at ?? ''),
          })
        } else if (entry.name && !entry.name.includes('/')) {
          pending.push(name)
        }
      }
      if (page.length < PAGE_SIZE) break
    }
  }
  return files
}

async function readRows(
  supabase: SupabaseClient,
  table: string,
  columns: string,
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase.from(table).select(columns).range(offset, offset + PAGE_SIZE - 1)
    if (error) throw new Error(`No se pudieron leer referencias de ${table}: ${error.message}`)
    const page = (data ?? []) as unknown as Record<string, unknown>[]
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
  }
  return rows
}

async function readReferences(supabase: SupabaseClient): Promise<StorageReferences> {
  const references: StorageReferences = {
    audio: new Set<string>(),
    artwork: new Set<string>(),
    covers: new Set<string>(),
  }

  const [tracks, liked, queue, messages, listens, reactions, showcases, plays, shared, profiles, playlists] =
    await Promise.all([
      readRows(supabase, 'playlist_tracks', 'audio_path,artwork_path'),
      readRows(supabase, 'me_gusta', 'audio_path,artwork_path'),
      readRows(supabase, 'jam_queue', 'audio_path,artwork_path'),
      readRows(supabase, 'messages', 'song'),
      readRows(supabase, 'escuchas', 'track'),
      readRows(supabase, 'reacciones_escucha', 'track'),
      readRows(supabase, 'profile_showcases', 'payload'),
      readRows(supabase, 'plays', 'artwork_path'),
      readRows(supabase, 'canciones_compartidas', 'artwork_path'),
      readRows(supabase, 'profiles', 'banner_path'),
      readRows(supabase, 'playlists', 'cover_path'),
    ])

  for (const row of [...tracks, ...liked, ...queue]) {
    addReference(references.audio, row.audio_path, 'songs')
    addReference(references.artwork, row.artwork_path, 'artwork')
  }
  for (const row of [...messages, ...listens, ...reactions]) {
    const track = objectValue(row.song) ?? objectValue(row.track)
    addReference(references.audio, track?.audioPath ?? track?.path, 'songs')
    addReference(references.artwork, track?.artworkPath, 'artwork')
  }
  for (const row of showcases) {
    const payload = objectValue(row.payload)
    addReference(references.audio, payload?.audioPath, 'songs')
    addReference(references.artwork, payload?.artworkPath, 'artwork')
  }
  for (const row of [...plays, ...shared]) addReference(references.artwork, row.artwork_path, 'artwork')
  for (const row of profiles) addReference(references.artwork, row.banner_path, 'artwork')
  for (const row of playlists) addReference(references.covers, row.cover_path, 'covers')

  return references
}

async function inventory(supabase: SupabaseClient) {
  const groups = await Promise.all(MANAGED_BUCKETS.map((bucket) => listBucket(supabase, bucket)))
  return groups.flat()
}

async function removeFiles(supabase: SupabaseClient, files: StorageFile[]) {
  const buckets = new Map<string, string[]>()
  for (const file of files) {
    const paths = buckets.get(file.bucket) ?? []
    paths.push(file.name)
    buckets.set(file.bucket, paths)
  }
  for (const [bucket, paths] of buckets) {
    for (let index = 0; index < paths.length; index += 100) {
      const batch = paths.slice(index, index + 100)
      const { error } = await supabase.storage.from(bucket).remove(batch)
      if (error) throw new Error(`No se pudo limpiar ${bucket}: ${error.message}`)
    }
  }
}

export async function auditStorageBudget(
  supabase: SupabaseClient,
  incomingBytes = 0,
  options: StorageBudgetOptions & { apply?: boolean } = {},
): Promise<StorageBudgetPlan> {
  const files = await inventory(supabase)
  const limits = normalizedOptions(options)
  const total = files.reduce((sum, file) => sum + file.bytes, 0)

  if (total + Math.max(0, incomingBytes) <= limits.targetBytes) {
    return planStorageBudget(files, { audio: new Set(), artwork: new Set(), covers: new Set() }, incomingBytes, options)
  }

  // Si una tabla no se puede leer, se aborta: nunca se interpreta “no pude
  // comprobar que está usado” como permiso para borrar.
  const references = await readReferences(supabase)
  const plan = planStorageBudget(files, references, incomingBytes, options)
  if (options.apply && plan.deletions.length) await removeFiles(supabase, plan.deletions)
  return plan
}

let budgetQueue: Promise<void> = Promise.resolve()

export function ensureStorageBudget(
  supabase: SupabaseClient,
  incomingBytes = 0,
  options: StorageBudgetOptions = {},
): Promise<StorageBudgetPlan> {
  const run = budgetQueue.then(async () => {
    const plan = await auditStorageBudget(supabase, incomingBytes, { ...options, apply: true })
    if (!plan.allowed) throw new StorageBudgetError(plan)
    if (plan.deletions.length) {
      console.info(
        `[storage] liberados ${(plan.deletedBytes / MIB).toFixed(1)} MiB en ${plan.deletions.length} objetos; ` +
          `proyección ${(plan.projectedBytes / MIB).toFixed(1)} MiB`,
      )
    }
    return plan
  })
  budgetQueue = run.then(() => undefined, () => undefined)
  return run
}
