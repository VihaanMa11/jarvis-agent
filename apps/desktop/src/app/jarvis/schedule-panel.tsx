/**
 * Mission Control — Calendar & Schedule.
 *
 * The operator's own diary, in TWO compact panels that sit side by side in the
 * dashboard's row of three (calendar | upcoming | Action Center): a month grid
 * with the days that carry something, and the upcoming list ("what I have to do
 * next"). They share one component because they share one piece of state — the
 * selected day — and the calendar alone is too tall for the row otherwise.
 *
 * The fragment is deliberate: both panels are laid out by the PARENT grid, so
 * neither wrapping div may exist between it and them.
 *
 * Renders from `@/store/schedule`, which owns the entries; this file owns only
 * the presentation and the interaction state (which month, which day).
 */

import { useStore } from '@nanostores/react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Check, ChevronLeft, ChevronRight, Clock, Plus, Trash2 } from '@/lib/icons'
import { $activeConnectionId } from '@/store/connections'
import { $activeGatewayProfile } from '@/store/profile'
import {
  $scheduleItems,
  $scheduleSync,
  $scheduleSyncError,
  BUCKET_LABELS,
  createScheduleItem,
  dayKey,
  deleteScheduleItem,
  formatDayKey,
  formatMonth,
  hydrateSchedule,
  patchScheduleItem,
  relativeDayLabel,
  SCHEDULE_KIND_LABELS,
  SCHEDULE_KINDS,
  scheduleBucket,
  scheduleItemsForDay,
  scheduleRequester,
  todayKey,
  upcomingScheduleItems
} from '@/store/schedule'
import type { ScheduleBucket, ScheduleItem, ScheduleKind, ScheduleRequester } from '@/store/schedule'

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const BUCKET_ORDER: readonly ScheduleBucket[] = ['overdue', 'today', 'tomorrow', 'week', 'later']
// The row is deliberately short — the list scrolls by leaving entries out, not by growing.
const UPCOMING_CAP = 5

/** Six fixed weeks from the Sunday on or before the 1st — stable height. */
function monthGrid(year: number, month: number): string[] {
  const first = new Date(year, month, 1)
  const start = new Date(year, month, 1 - first.getDay())

  return Array.from({ length: 42 }, (_, offset) =>
    dayKey(new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset))
  )
}

function kindClass(kind: ScheduleKind): string {
  return `jarvis-sched-kind kind-${kind}`
}

function ScheduleRow({
  item,
  onDelete,
  onToggle
}: {
  item: ScheduleItem
  onDelete: (id: string) => void
  onToggle: (item: ScheduleItem) => void
}) {
  return (
    <div className={`jarvis-sched-row${item.done ? ' is-done' : ''}`}>
      <button
        aria-label={item.done ? `Reopen ${item.title}` : `Mark ${item.title} done`}
        className="jarvis-sched-check"
        onClick={() => onToggle(item)}
        type="button"
      >
        {item.done ? <Check className="size-3.5" /> : null}
      </button>

      <div className="jarvis-sched-row-body">
        <div className="jarvis-sched-row-top">
          <span className="jarvis-sched-row-title">{item.title}</span>
          <span className={kindClass(item.kind)}>{SCHEDULE_KIND_LABELS[item.kind]}</span>
        </div>
        {item.detail ? <div className="jarvis-sched-row-detail">{item.detail}</div> : null}
        <div className="jarvis-sched-row-when">
          {item.time ? `${item.time} · ` : 'All day · '}
          {relativeDayLabel(item.date)}
        </div>
      </div>

      <button
        aria-label={`Delete ${item.title}`}
        className="jarvis-sched-remove"
        onClick={() => onDelete(item.id)}
        type="button"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  )
}

export function ScheduleBoard() {
  const items = useStore($scheduleItems)
  const sync = useStore($scheduleSync)
  const syncError = useStore($scheduleSyncError)
  const profile = useStore($activeGatewayProfile)
  const today = todayKey()
  const todayDate = new Date()

  // The gateway owns the diary; this panel reads and writes it through `jarvis.schedule`,
  // routed by (connection, profile) so a REMOTE backend is reached, not a local one.
  const connectionId = useStore($activeConnectionId)
  const request = useMemo<ScheduleRequester>(() => scheduleRequester(connectionId, profile), [connectionId, profile])

  useEffect(() => {
    void hydrateSchedule(request)
  }, [request])

  const [cursor, setCursor] = useState(() => ({ month: todayDate.getMonth(), year: todayDate.getFullYear() }))
  const [selectedDay, setSelectedDay] = useState<null | string>(null)

  const [draftTitle, setDraftTitle] = useState('')
  const [draftDate, setDraftDate] = useState(today)
  const [draftTime, setDraftTime] = useState('')
  const [draftKind, setDraftKind] = useState<ScheduleKind>('task')
  const [draftError, setDraftError] = useState('')

  const grid = useMemo(() => monthGrid(cursor.year, cursor.month), [cursor.month, cursor.year])

  const byDay = useMemo(() => {
    const counts = new Map<string, number>()

    for (const item of items) {
      counts.set(item.date, (counts.get(item.date) ?? 0) + 1)
    }

    return counts
  }, [items])

  const upcoming = useMemo(() => upcomingScheduleItems(items, today, UPCOMING_CAP), [items, today])

  const hiddenUpcoming = useMemo(
    () => upcomingScheduleItems(items, today).length - upcoming.length,
    [items, today, upcoming.length]
  )

  const selectedItems = useMemo(
    () => (selectedDay ? scheduleItemsForDay(items, selectedDay) : []),
    [items, selectedDay]
  )

  const shiftMonth = useCallback((delta: number) => {
    setCursor(current => {
      const next = new Date(current.year, current.month + delta, 1)

      return { month: next.getMonth(), year: next.getFullYear() }
    })
  }, [])

  const handleAdd = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault()

      if (!draftTitle.trim()) {
        setDraftError('Give the entry a title.')

        return
      }

      void createScheduleItem(request, {
        date: draftDate,
        kind: draftKind,
        title: draftTitle,
        ...(draftTime ? { time: draftTime } : {})
      }).then(row => {
        if (!row) {
          setDraftError('That date or time is not valid.')

          return
        }

        setDraftError('')
        setDraftTitle('')
        setDraftTime('')
        setDraftDate(row.date)

        // Land the calendar on whatever was just added.
        const added = new Date(row.date)

        setCursor({ month: added.getMonth(), year: added.getFullYear() })
      })
    },
    [draftDate, draftKind, draftTime, draftTitle, request]
  )

  const handleDelete = useCallback(
    (id: string) => {
      void deleteScheduleItem(request, id)
    },
    [request]
  )

  const handleToggle = useCallback(
    (item: ScheduleItem) => {
      void patchScheduleItem(request, item.id, { done: !item.done })
    },
    [request]
  )

  const openCount = items.filter(item => !item.done).length

  return (
    <>
      {/* ── Month grid + add form ── */}
      <div className="jarvis-panel-card is-compact">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-slate-200 flex items-center gap-2">
            <Clock className="size-4 text-cyan-400" />
            Schedule & Calendar
          </h3>
          <span className="text-xs text-slate-400">
            {openCount} open ·{' '}
            <span
              className={
                sync === 'synced' ? 'text-emerald-400' : sync === 'syncing' ? 'text-amber-400' : 'text-slate-500'
              }
              title={
                sync === 'synced'
                  ? 'Synced with the JARVIS server — entries are visible to every surface'
                  : sync === 'syncing'
                    ? 'Talking to the JARVIS server'
                    : 'Server unreachable — entries are kept on this machine'
              }
            >
              {sync === 'synced' ? 'server' : sync === 'syncing' ? 'syncing' : 'local'}
            </span>
          </span>
        </div>

        <div className="jarvis-cal-head">
          <Button
            aria-label="Previous month"
            className="h-7 w-7 p-0 text-slate-300 hover:text-cyan-400"
            onClick={() => shiftMonth(-1)}
            size="sm"
            variant="ghost"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="jarvis-cal-month">{formatMonth(cursor.year, cursor.month)}</span>
          <Button
            aria-label="Next month"
            className="h-7 w-7 p-0 text-slate-300 hover:text-cyan-400"
            onClick={() => shiftMonth(1)}
            size="sm"
            variant="ghost"
          >
            <ChevronRight className="size-4" />
          </Button>
          <Button
            className="h-7 text-xs text-cyan-400 hover:bg-cyan-500/10 ml-auto"
            onClick={() => {
              setCursor({ month: todayDate.getMonth(), year: todayDate.getFullYear() })
              setSelectedDay(today)
              setDraftDate(today)
            }}
            size="sm"
            variant="ghost"
          >
            Today
          </Button>
        </div>

        <div className="jarvis-cal-weekdays">
          {WEEKDAY_LABELS.map((label, index) => (
            <span key={`${label}-${index}`}>{label}</span>
          ))}
        </div>

        <div className="jarvis-cal-grid">
          {grid.map(day => {
            const inMonth = Number(day.slice(5, 7)) === cursor.month + 1
            const count = byDay.get(day) ?? 0

            const classes = [
              'jarvis-cal-day',
              inMonth ? '' : 'is-outside',
              day === today ? 'is-today' : '',
              day === selectedDay ? 'is-selected' : ''
            ]
              .filter(Boolean)
              .join(' ')

            return (
              <button
                className={classes}
                key={day}
                onClick={() => {
                  setSelectedDay(current => (current === day ? null : day))
                  setDraftDate(day)
                }}
                title={count ? `${count} entr${count === 1 ? 'y' : 'ies'} on ${formatDayKey(day)}` : formatDayKey(day)}
                type="button"
              >
                <span className="jarvis-cal-day-num">{Number(day.slice(8, 10))}</span>
                {count ? <span className="jarvis-cal-dot" data-count={count > 3 ? '3+' : count} /> : null}
              </button>
            )
          })}
        </div>

        <form className="jarvis-sched-form" onSubmit={handleAdd}>
          <input
            aria-label="Schedule entry title"
            className="jarvis-sched-input jarvis-sched-input-title"
            onChange={event => setDraftTitle(event.target.value)}
            placeholder="Add to the diary — client visit, deadline, travel…"
            type="text"
            value={draftTitle}
          />
          <input
            aria-label="Schedule entry date"
            className="jarvis-sched-input"
            onChange={event => setDraftDate(event.target.value)}
            type="date"
            value={draftDate}
          />
          <input
            aria-label="Schedule entry time"
            className="jarvis-sched-input"
            onChange={event => setDraftTime(event.target.value)}
            type="time"
            value={draftTime}
          />
          <select
            aria-label="Schedule entry kind"
            className="jarvis-sched-input"
            onChange={event => setDraftKind(event.target.value as ScheduleKind)}
            value={draftKind}
          >
            {SCHEDULE_KINDS.map(kind => (
              <option key={kind} value={kind}>
                {SCHEDULE_KIND_LABELS[kind]}
              </option>
            ))}
          </select>
          <Button className="bg-cyan-600 hover:bg-cyan-500 text-white h-8" size="sm" type="submit" variant="default">
            <Plus className="size-3.5 mr-1" /> Add
          </Button>
        </form>
        {draftError ? <p className="jarvis-sched-error">{draftError}</p> : null}
        {sync === 'local' && syncError ? (
          <p className="jarvis-sched-error" title={syncError}>
            Server unreachable — entries are kept on this machine. {syncError.slice(0, 120)}
          </p>
        ) : null}
      </div>

      {/* ── Upcoming, or the selected day ── */}
      <div className="jarvis-panel-card is-compact">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-slate-200 flex items-center gap-2">
            <Clock className="size-4 text-cyan-400" />
            {selectedDay ? `Day Plan · ${formatDayKey(selectedDay)}` : `Upcoming (${upcoming.length})`}
          </h3>
          {selectedDay ? (
            <Button
              className="h-7 text-xs text-cyan-400 hover:bg-cyan-500/10"
              onClick={() => setSelectedDay(null)}
              size="sm"
              variant="ghost"
            >
              Show all upcoming
            </Button>
          ) : (
            <span className="text-xs text-slate-400">What I have to do next</span>
          )}
        </div>

        {selectedDay ? (
          selectedItems.length === 0 ? (
            <p className="text-sm text-slate-500">Nothing on this day yet.</p>
          ) : (
            selectedItems.map(item => (
              <ScheduleRow item={item} key={item.id} onDelete={handleDelete} onToggle={handleToggle} />
            ))
          )
        ) : upcoming.length === 0 ? (
          <p className="text-sm text-slate-500">
            The diary is empty. Add the next commitment above and JARVIS will keep it in view here.
          </p>
        ) : (
          <>
            {BUCKET_ORDER.map(bucket => {
              const bucketItems = upcoming.filter(item => scheduleBucket(item.date, today) === bucket)

              if (bucketItems.length === 0) {
                return null
              }

              return (
                <div className="jarvis-sched-group" key={bucket}>
                  <div className={`jarvis-sched-group-label label-${bucket}`}>{BUCKET_LABELS[bucket]}</div>
                  {bucketItems.map(item => (
                    <ScheduleRow item={item} key={item.id} onDelete={handleDelete} onToggle={handleToggle} />
                  ))}
                </div>
              )
            })}
            {hiddenUpcoming > 0 ? (
              <p className="text-xs text-slate-500 pt-1">+{hiddenUpcoming} more scheduled</p>
            ) : null}
          </>
        )}
      </div>
    </>
  )
}
