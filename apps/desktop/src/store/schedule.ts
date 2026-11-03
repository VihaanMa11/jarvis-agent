/**
 * JARVIS Mission Control — the operator's schedule (calendar entries).
 *
 * Scope: this desktop install, NOT the gateway. Entries persist through the
 * app's one persistence choke point (`@/lib/storage`) under
 * `hermes.desktop.schedule.v1`, so they are shared by every window of the app
 * on this machine and survive restarts, but they are not a backend store: a
 * second machine, or the phone, does not see them. The key is deliberately
 * profile-free — a client visit is the user's calendar, not one profile's.
 *
 * Everything here is pure except the atom and its persistence, so the date
 * bucketing the panel renders can be tested without a DOM.
 */

import { atom } from 'nanostores'

import { readJson, writeJson } from '@/lib/storage'

export type ScheduleKind = 'client' | 'deadline' | 'meeting' | 'task' | 'travel'

export const SCHEDULE_KINDS: readonly ScheduleKind[] = ['client', 'deadline', 'meeting', 'task', 'travel']

export const SCHEDULE_KIND_LABELS: Record<ScheduleKind, string> = {
  client: 'Client',
  deadline: 'Deadline',
  meeting: 'Meeting',
  task: 'Task',
  travel: 'Travel'
}

export interface ScheduleItem {
  createdAt: number
  /** Local calendar day, `YYYY-MM-DD`. */
  date: string
  detail?: string
  done: boolean
  id: string
  kind: ScheduleKind
  /** Local 24h clock `HH:MM`; absent on all-day entries. */
  time?: string
  title: string
}

/** Draft accepted from the panel's add form. */
export interface ScheduleDraft {
  date: string
  detail?: string
  kind?: ScheduleKind
  time?: string
  title: string
}

export const SCHEDULE_STORAGE_KEY = 'hermes.desktop.schedule.v1'

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/
// 24h clock, 00:00–23:59 — `99:99` is not a time and must not survive a load.
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/
const MAX_TITLE = 140

// ── day keys ────────────────────────────────────────────────────────────────
// A day key is a calendar day in the user's own timezone. `Date` arithmetic in
// local time (not `toISOString`, which is UTC and shifts the day near
// midnight) is the only way that stays honest on IST.

export function dayKey(date: Date): string {
  const y = date.getFullYear()
  const m = `${date.getMonth() + 1}`.padStart(2, '0')
  const d = `${date.getDate()}`.padStart(2, '0')

  return `${y}-${m}-${d}`
}

export function todayKey(now: Date = new Date()): string {
  return dayKey(now)
}

/** Local midnight for a day key, or `null` when the key is not a real day. */
export function dayKeyToDate(key: string): Date | null {
  if (!DAY_KEY_RE.test(key)) {
    return null
  }

  const [y, m, d] = key.split('-').map(Number)
  const date = new Date(y, m - 1, d)

  // Rejects 2026-02-31 and friends: Date rolls them forward.
  return dayKey(date) === key ? date : null
}

export function addDays(key: string, days: number): string {
  const date = dayKeyToDate(key)

  if (!date) {
    return key
  }

  date.setDate(date.getDate() + days)

  return dayKey(date)
}

/** Whole days from `from` to `to` (negative when `to` is in the past). */
export function daysBetween(from: string, to: string): number {
  const a = dayKeyToDate(from)
  const b = dayKeyToDate(to)

  if (!a || !b) {
    return 0
  }

  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** `Wed 5 Nov` — short enough for a list row. */
export function formatDayKey(key: string): string {
  const date = dayKeyToDate(key)

  return date ? `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}` : key
}

export function formatMonth(year: number, month: number): string {
  return `${MONTHS[month]} ${year}`
}

/** `Today` / `Tomorrow` / `Yesterday` / `in 4d` / `3d overdue`, else the date. */
export function relativeDayLabel(key: string, today: string = todayKey()): string {
  const delta = daysBetween(today, key)

  if (delta === 0) {
    return 'Today'
  }

  if (delta === 1) {
    return 'Tomorrow'
  }

  if (delta === -1) {
    return 'Yesterday'
  }

  if (delta < -1) {
    return `${Math.abs(delta)}d overdue`
  }

  return delta <= 7 ? `in ${delta}d` : formatDayKey(key)
}

export type ScheduleBucket = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later'

/** Which slice of the upcoming list a day belongs to. */
export function scheduleBucket(key: string, today: string = todayKey()): ScheduleBucket {
  const delta = daysBetween(today, key)

  if (delta < 0) {
    return 'overdue'
  }

  if (delta === 0) {
    return 'today'
  }

  if (delta === 1) {
    return 'tomorrow'
  }

  return delta <= 7 ? 'week' : 'later'
}

export const BUCKET_LABELS: Record<ScheduleBucket, string> = {
  overdue: 'Overdue',
  today: 'Today',
  tomorrow: 'Tomorrow',
  week: 'This week',
  later: 'Later'
}

// ── shape validation ────────────────────────────────────────────────────────

function cleanText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

/** Returns null for anything that is not a usable entry (dropped, not fixed). */
export function normalizeScheduleItem(raw: unknown): ScheduleItem | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }

  const source = raw as Record<string, unknown>
  const title = cleanText(source.title, MAX_TITLE)
  const date = cleanText(source.date, 10)

  if (!title || !dayKeyToDate(date)) {
    return null
  }

  const time = cleanText(source.time, 5)
  const kind = SCHEDULE_KINDS.includes(source.kind as ScheduleKind) ? (source.kind as ScheduleKind) : 'task'
  const detail = cleanText(source.detail, 400)
  const id = cleanText(source.id, 64) || newScheduleId()

  const createdAt =
    typeof source.createdAt === 'number' && Number.isFinite(source.createdAt) ? source.createdAt : Date.now()

  return {
    createdAt,
    date,
    ...(detail ? { detail } : {}),
    done: source.done === true,
    id,
    kind,
    ...(TIME_RE.test(time) ? { time } : {}),
    title
  }
}

function newScheduleId(): string {
  const uuid = globalThis.crypto?.randomUUID?.()

  return uuid ?? `sched-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function readStoredItems(): ScheduleItem[] {
  const raw = readJson<unknown>(SCHEDULE_STORAGE_KEY)

  if (!Array.isArray(raw)) {
    return []
  }

  return raw.map(normalizeScheduleItem).filter((item): item is ScheduleItem => item !== null)
}

// ── the store ───────────────────────────────────────────────────────────────

export const $scheduleItems = atom<ScheduleItem[]>(readStoredItems())

export function scheduleItems(): ScheduleItem[] {
  return $scheduleItems.get()
}

function commit(items: ScheduleItem[]): void {
  const sorted = sortScheduleItems(items)

  // Atom first so the panel updates even where storage is unavailable.
  $scheduleItems.set(sorted)
  writeJson(SCHEDULE_STORAGE_KEY, sorted)
}

/** Date first, then time (all-day entries lead their day), newest edit last. */
export function sortScheduleItems(items: readonly ScheduleItem[]): ScheduleItem[] {
  return [...items].sort(
    (a, b) =>
      a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '') || a.title.localeCompare(b.title)
  )
}

/** Replaces the whole list — used by tests and by nothing else today. */
export function setScheduleItems(items: readonly ScheduleItem[]): void {
  commit(items.map(normalizeScheduleItem).filter((item): item is ScheduleItem => item !== null))
}

export function addScheduleItem(draft: ScheduleDraft): ScheduleItem | null {
  const item = normalizeScheduleItem({ ...draft, createdAt: Date.now(), done: false, id: newScheduleId() })

  if (!item) {
    return null
  }

  commit([...scheduleItems(), item])

  return item
}

export function updateScheduleItem(id: string, patch: Partial<Omit<ScheduleItem, 'createdAt' | 'id'>>): boolean {
  const current = scheduleItems()
  const existing = current.find(item => item.id === id)

  if (!existing) {
    return false
  }

  // normalizeScheduleItem is the validator: an edit that would empty the title
  // or wreck the date is rejected outright rather than silently coerced.
  const next = normalizeScheduleItem({ ...existing, ...patch, createdAt: existing.createdAt, id })

  if (!next) {
    return false
  }

  commit(current.map(item => (item.id === id ? next : item)))

  return true
}

export function toggleScheduleItemDone(id: string): boolean {
  const existing = scheduleItems().find(item => item.id === id)

  return existing ? updateScheduleItem(id, { done: !existing.done }) : false
}

export function removeScheduleItem(id: string): boolean {
  const current = scheduleItems()
  const next = current.filter(item => item.id !== id)

  if (next.length === current.length) {
    return false
  }

  commit(next)

  return true
}

/** Entries on one day, in display order. */
export function scheduleItemsForDay(items: readonly ScheduleItem[], key: string): ScheduleItem[] {
  return sortScheduleItems(items.filter(item => item.date === key))
}

/**
 * What is still ahead: everything from today onward, overdue items included
 * (unfinished work stays visible until it is done or deleted). Completed
 * entries drop out.
 */
export function upcomingScheduleItems(
  items: readonly ScheduleItem[],
  today: string = todayKey(),
  limit?: number
): ScheduleItem[] {
  const upcoming = sortScheduleItems(items.filter(item => !item.done && item.date >= today))
  const overdue = sortScheduleItems(items.filter(item => !item.done && item.date < today))
  const all = [...overdue, ...upcoming]

  return typeof limit === 'number' ? all.slice(0, limit) : all
}

export function nextScheduleItem(items: readonly ScheduleItem[], now: Date = new Date()): ScheduleItem | null {
  const today = todayKey(now)
  const nowTime = `${`${now.getHours()}`.padStart(2, '0')}:${`${now.getMinutes()}`.padStart(2, '0')}`
  const live = sortScheduleItems(items.filter(item => !item.done))
  // Later today, then the next day with anything on it.
  const laterToday = live.find(item => item.date === today && (item.time ?? '').localeCompare(nowTime) >= 0)

  return laterToday ?? live.find(item => item.date > today) ?? null
}

// ── gateway sync ────────────────────────────────────────────────────────────
// The diary's authority is the GATEWAY (`hermes_cli/jarvis_schedule.py`, RPC
// `jarvis.schedule`), because the agent writes entries from chat and every surface reads
// the same list. This store is the panel's CACHE of that truth: localStorage keeps the
// last snapshot so the row still draws with the gateway away, and a mutation paints
// locally first, then reconciles against the row the server hands back. A write that the
// server refuses keeps the optimistic row and drops the panel to `local` — the user's
// typing is never thrown away to make the sync indicator look green.

/** A gateway request function: `requestGatewayForProfile(profile, method, params)`. */
export type ScheduleRequester = (method: string, params?: Record<string, unknown>) => Promise<unknown>

export type ScheduleSync = 'local' | 'synced' | 'syncing'

export const $scheduleSync = atom<ScheduleSync>('local')

/** The wire row (`jarvis.schedule`), snake_case exactly as it travels. */
interface ScheduleWireItem {
  created_at?: number
  date?: string
  detail?: string
  done?: boolean
  id?: string
  kind?: string
  source?: string
  time?: string
  title?: string
  updated_at?: number
}

/** Server row → panel entry. Anything unusable reads as null and is dropped. */
export function fromScheduleWire(row: ScheduleWireItem): ScheduleItem | null {
  return normalizeScheduleItem({
    createdAt: row.created_at,
    date: row.date,
    done: row.done,
    id: row.id,
    title: row.title,
    ...(row.detail ? { detail: row.detail } : {}),
    ...(row.kind ? { kind: row.kind } : {}),
    ...(row.time ? { time: row.time } : {})
  })
}

/** The subset of entry fields a write can carry; absent keys stay absent on the wire. */
type ScheduleWireDraft = Partial<{
  date: string
  detail: string
  done: boolean
  id: string
  kind: ScheduleKind
  source: string
  time: string
  title: string
}>

function wireDraft(draft: ScheduleWireDraft): Record<string, unknown> {
  return {
    ...(draft.id ? { id: draft.id } : {}),
    ...(draft.date ? { date: draft.date } : {}),
    ...(draft.kind ? { kind: draft.kind } : {}),
    ...(draft.title ? { title: draft.title } : {}),
    ...(draft.time ? { time: draft.time } : {}),
    ...(draft.detail ? { detail: draft.detail } : {}),
    ...(draft.source ? { source: draft.source } : {}),
    ...(typeof draft.done === 'boolean' ? { done: draft.done } : {})
  }
}

function adopt(optimisticId: string, stored: ScheduleItem): void {
  const current = scheduleItems()

  const next = current.some(item => item.id === optimisticId)
    ? current.map(item => (item.id === optimisticId ? stored : item))
    : [...current, stored]

  commit(next)
}

/** Pull the gateway's list into the cache. False when it could not be reached. */
export async function hydrateSchedule(request: ScheduleRequester): Promise<boolean> {
  $scheduleSync.set('syncing')

  try {
    const result = (await request('jarvis.schedule', { action: 'list' })) as { items?: ScheduleWireItem[] } | null
    const rows = Array.isArray(result?.items) ? result.items : []

    commit(rows.map(fromScheduleWire).filter((item): item is ScheduleItem => item !== null))
    $scheduleSync.set('synced')

    return true
  } catch {
    // Offline, or a backend older than this panel: keep the cached snapshot.
    $scheduleSync.set('local')

    return false
  }
}

/** Create an entry: paint it now, then adopt the row the gateway stores. */
export async function createScheduleItem(
  request: ScheduleRequester,
  draft: ScheduleDraft
): Promise<ScheduleItem | null> {
  const optimistic = addScheduleItem(draft)

  if (!optimistic) {
    return null
  }

  $scheduleSync.set('syncing')

  try {
    const result = (await request('jarvis.schedule', {
      action: 'upsert',
      item: wireDraft({ ...draft, source: 'desktop' })
    })) as { item?: ScheduleWireItem } | null

    const stored = result?.item ? fromScheduleWire(result.item) : null

    if (!stored) {
      $scheduleSync.set('local')

      return optimistic
    }

    adopt(optimistic.id, stored)
    $scheduleSync.set('synced')

    return stored
  } catch {
    $scheduleSync.set('local')

    return optimistic
  }
}

/** Patch an entry (done, title, time…): same optimistic-then-adopt dance. */
export async function patchScheduleItem(
  request: ScheduleRequester,
  id: string,
  patch: Partial<Omit<ScheduleItem, 'createdAt' | 'id'>>
): Promise<boolean> {
  if (!updateScheduleItem(id, patch)) {
    return false
  }

  $scheduleSync.set('syncing')

  try {
    const result = (await request('jarvis.schedule', {
      action: 'upsert',
      item: wireDraft({ id, ...patch })
    })) as { item?: ScheduleWireItem } | null

    const stored = result?.item ? fromScheduleWire(result.item) : null

    if (stored) {
      adopt(id, stored)
    }

    $scheduleSync.set('synced')

    return true
  } catch {
    $scheduleSync.set('local')

    return true
  }
}

/** Remove an entry locally and on the gateway. */
export async function deleteScheduleItem(request: ScheduleRequester, id: string): Promise<boolean> {
  const removed = removeScheduleItem(id)

  if (!removed) {
    return false
  }

  $scheduleSync.set('syncing')

  try {
    await request('jarvis.schedule', { action: 'remove', id })
    $scheduleSync.set('synced')

    return true
  } catch {
    $scheduleSync.set('local')

    return true
  }
}
