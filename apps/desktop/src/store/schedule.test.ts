import { beforeEach, describe, expect, it, vi } from 'vitest'

const KEY = 'hermes.desktop.schedule.v1'

/** Fresh module per test: the atom reads storage once, at import time. */
async function loadStore() {
  vi.resetModules()

  return import('./schedule')
}

beforeEach(() => {
  localStorage.clear()
})

describe('day keys', () => {
  it('round-trips a local calendar day and rejects impossible ones', async () => {
    const { dayKey, dayKeyToDate } = await loadStore()
    const date = new Date(2026, 10, 3)

    expect(dayKey(date)).toBe('2026-11-03')
    expect(dayKey(dayKeyToDate('2026-11-03')!)).toBe('2026-11-03')
    // Date would roll 31 Feb forward to 3 Mar — the key must not survive.
    expect(dayKeyToDate('2026-02-31')).toBeNull()
    expect(dayKeyToDate('3 Nov 2026')).toBeNull()
  })

  it('counts days between keys across a month boundary', async () => {
    const { addDays, daysBetween } = await loadStore()

    expect(addDays('2026-11-30', 2)).toBe('2026-12-02')
    expect(daysBetween('2026-11-30', '2026-12-02')).toBe(2)
    expect(daysBetween('2026-12-02', '2026-11-30')).toBe(-2)
  })
})

describe('labelling', () => {
  it('names near days and buckets the rest', async () => {
    const { BUCKET_LABELS, relativeDayLabel, scheduleBucket } = await loadStore()
    const today = '2026-11-03'

    expect(relativeDayLabel(today, today)).toBe('Today')
    expect(relativeDayLabel('2026-11-04', today)).toBe('Tomorrow')
    expect(relativeDayLabel('2026-11-02', today)).toBe('Yesterday')
    expect(relativeDayLabel('2026-11-05', today)).toBe('in 2d')
    expect(relativeDayLabel('2026-11-01', today)).toBe('2d overdue')
    expect(relativeDayLabel('2026-12-20', today)).toBe('Sun 20 Dec')

    expect(scheduleBucket('2026-11-01', today)).toBe('overdue')
    expect(scheduleBucket(today, today)).toBe('today')
    expect(scheduleBucket('2026-11-04', today)).toBe('tomorrow')
    expect(scheduleBucket('2026-11-09', today)).toBe('week')
    expect(scheduleBucket('2026-11-30', today)).toBe('later')
    expect(BUCKET_LABELS.overdue).toBe('Overdue')
  })
})

describe('entries', () => {
  it('refuses an entry with no title or an impossible date', async () => {
    const { addScheduleItem, scheduleItems } = await loadStore()

    expect(addScheduleItem({ date: '2026-11-03', title: '   ' })).toBeNull()
    expect(addScheduleItem({ date: '2026-02-31', title: 'Kolkata client visit' })).toBeNull()
    expect(scheduleItems()).toEqual([])
  })

  it('persists a valid entry and rehydrates it in the next session', async () => {
    const store = await loadStore()

    const created = store.addScheduleItem({
      date: '2026-11-20',
      detail: 'BNPL client — kickoff',
      kind: 'travel',
      time: '09:30',
      title: 'Fly to Kolkata'
    })

    expect(created).not.toBeNull()
    expect(created!.kind).toBe('travel')
    expect(created!.done).toBe(false)
    expect(JSON.parse(localStorage.getItem(KEY)!)).toHaveLength(1)

    const rehydrated = await loadStore()

    expect(rehydrated.scheduleItems()).toHaveLength(1)
    expect(rehydrated.scheduleItems()[0]).toMatchObject({
      date: '2026-11-20',
      kind: 'travel',
      time: '09:30',
      title: 'Fly to Kolkata'
    })
  })

  it('drops unusable stored rows instead of rendering them', async () => {
    localStorage.setItem(
      KEY,
      JSON.stringify([
        { date: '2026-11-20', title: 'Good one' },
        { date: 'nonsense', title: 'Bad date' },
        { date: '2026-11-21', title: '' },
        'not an object',
        { date: '2026-11-22', kind: 'gallivanting', time: '99:99', title: 'Odd fields' }
      ])
    )

    const { scheduleItems } = await loadStore()

    expect(scheduleItems().map(item => item.title)).toEqual(['Good one', 'Odd fields'])
    // Unknown kind falls back to `task`; a malformed clock is dropped, not kept.
    expect(scheduleItems()[1].kind).toBe('task')
    expect(scheduleItems()[1].time).toBeUndefined()
  })

  it('toggles, edits and removes by id', async () => {
    const { addScheduleItem, removeScheduleItem, scheduleItems, toggleScheduleItemDone, updateScheduleItem } =
      await loadStore()

    const item = addScheduleItem({ date: '2026-11-20', title: 'Sign the BNPL contract' })!

    expect(toggleScheduleItemDone(item.id)).toBe(true)
    expect(scheduleItems()[0].done).toBe(true)

    expect(updateScheduleItem(item.id, { time: '14:00', title: 'Sign the BNPL MSA' })).toBe(true)
    expect(scheduleItems()[0]).toMatchObject({ time: '14:00', title: 'Sign the BNPL MSA' })
    // An edit that would empty the title is refused outright.
    expect(updateScheduleItem(item.id, { title: '  ' })).toBe(false)
    expect(scheduleItems()[0].title).toBe('Sign the BNPL MSA')

    expect(toggleScheduleItemDone('missing')).toBe(false)
    expect(removeScheduleItem(item.id)).toBe(true)
    expect(scheduleItems()).toEqual([])
    expect(removeScheduleItem(item.id)).toBe(false)
  })
})

describe('ordering', () => {
  it('leads a day with its all-day entries and sorts the rest by clock', async () => {
    const { sortScheduleItems } = await loadStore()
    const base = { createdAt: 0, done: false, kind: 'task' as const }

    const sorted = sortScheduleItems([
      { ...base, date: '2026-11-20', id: 'c', time: '18:00', title: 'Evening' },
      { ...base, date: '2026-11-20', id: 'a', title: 'All day' },
      { ...base, date: '2026-11-19', id: 'd', time: '07:00', title: 'Earlier day' },
      { ...base, date: '2026-11-20', id: 'b', time: '09:00', title: 'Morning' }
    ])

    expect(sorted.map(item => item.id)).toEqual(['d', 'a', 'b', 'c'])
  })

  it('keeps overdue work in the upcoming list and drops what is done', async () => {
    const { upcomingScheduleItems } = await loadStore()
    const today = '2026-11-03'
    const base = { createdAt: 0, kind: 'task' as const, title: 'x' }

    const upcoming = upcomingScheduleItems(
      [
        { ...base, date: '2026-11-10', done: false, id: 'later' },
        { ...base, date: '2026-11-02', done: false, id: 'overdue' },
        { ...base, date: '2026-11-03', done: false, id: 'today' },
        { ...base, date: '2026-11-04', done: true, id: 'done' }
      ],
      today
    )

    expect(upcoming.map(item => item.id)).toEqual(['overdue', 'today', 'later'])
    expect(upcomingScheduleItems([{ ...base, date: '2026-11-10', done: false, id: 'later' }], today, 0)).toEqual([])
  })

  it('points at the next commitment: later today first, else the next day', async () => {
    const { nextScheduleItem } = await loadStore()
    const base = { createdAt: 0, done: false, kind: 'meeting' as const }
    const now = new Date(2026, 10, 3, 12, 0)

    const items = [
      { ...base, date: '2026-11-03', id: 'past', time: '09:00', title: 'Already gone' },
      { ...base, date: '2026-11-03', id: 'evening', time: '18:00', title: 'Evening call' },
      { ...base, date: '2026-11-05', id: 'travel', title: 'Fly to Kolkata' }
    ]

    expect(nextScheduleItem(items, now)?.id).toBe('evening')
    expect(nextScheduleItem([items[0], items[2]], now)?.id).toBe('travel')
    expect(
      nextScheduleItem([{ ...base, date: '2026-11-03', done: true, id: 'x', time: '18:00', title: 'done' }], now)
    ).toBe(null)
  })
})
