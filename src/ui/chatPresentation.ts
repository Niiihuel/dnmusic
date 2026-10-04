import type { Message } from '../models/message'

const time = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })
const day = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
const valid = (date?: Date | null): date is Date => !!date && Number.isFinite(date.getTime())
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

export function sameChatGroup(a?: Message, b?: Message): boolean {
  if (!a || !b || a.deletedAt || b.deletedAt || a.senderUid !== b.senderUid || !valid(a.createdAt) || !valid(b.createdAt)) return false
  const gap = b.createdAt.getTime() - a.createdAt.getTime()
  return sameDay(a.createdAt, b.createdAt) && gap >= 0 && gap < 5 * 60_000
}

export function chatTime(date: Date): string { return valid(date) ? time.format(date) : '' }

export function chatDayLabel(date?: Date | null, previous?: Date | null, now = new Date()): string | null {
  if (!valid(date) || (valid(previous) && sameDay(date, previous))) return null
  if (sameDay(date, now)) return 'Hoy'
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1)
  if (sameDay(date, yesterday)) return 'Ayer'
  return day.format(date)
}
