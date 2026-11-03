import { beforeEach, describe, expect, it, vi } from 'vitest'

// The store routes through the app's gateway client; mocking it keeps this test about the
// diary (and lets the request ladder be observed) instead of booting the whole app.
vi.mock('@/store/gateway', () => ({
  requestGatewayForAgent: vi.fn(),
  requestGatewayForProfile: vi.fn()
}))

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

describe('request ladder', () => {
  /** Load the store FIRST: `loadStore()` resets the module registry, so a gateway imported
   *  before it would be a different (unused) instance than the one the store holds. */
  async function loaded() {
    const store = await loadStore()
    const gw = await import('@/store/gateway')

    vi.mocked(gw.requestGatewayForAgent).mockReset()
    vi.mocked(gw.requestGatewayForProfile).mockReset()

    return { gw, store }
  }

  it('uses the (connection, profile) route first', async () => {
    const { gw, store } = await loaded()
    vi.mocked(gw.requestGatewayForAgent).mockResolvedValue({ items: [] })
    vi.mocked(gw.requestGatewayForProfile).mockResolvedValue({ items: [] })

    await store.scheduleRequester('conn-1', 'default')('jarvis.schedule', { action: 'list' })

    expect(gw.requestGatewayForAgent).toHaveBeenCalledWith('conn-1', 'default', 'jarvis.schedule', { action: 'list' })
    expect(gw.requestGatewayForProfile).not.toHaveBeenCalled()
  })

  it('falls back to the ambient profile socket when the composite route cannot be resolved', async () => {
    const { gw, store } = await loaded()
    vi.mocked(gw.requestGatewayForAgent).mockRejectedValue(new Error('no such connection'))
    vi.mocked(gw.requestGatewayForProfile).mockResolvedValue({ items: [] })

    const result = await store.scheduleRequester('conn-1', 'default')('jarvis.schedule', { action: 'list' })

    expect(result).toEqual({ items: [] })
    expect(gw.requestGatewayForProfile).toHaveBeenCalledWith('default', 'jarvis.schedule', { action: 'list' })
  })

  it('skips the composite rung without a connection, and defaults the profile name', async () => {
    const { gw, store } = await loaded()
    vi.mocked(gw.requestGatewayForProfile).mockResolvedValue({ items: [] })

    await store.scheduleRequester(null, '')('jarvis.schedule', { action: 'list' })

    expect(gw.requestGatewayForAgent).not.toHaveBeenCalled()
    expect(gw.requestGatewayForProfile).toHaveBeenCalledWith('default', 'jarvis.schedule', { action: 'list' })
  })

  it('records why a read failed so the panel can say so', async () => {
    const store = await loadStore()

    await store.hydrateSchedule(async () => {
      throw new Error('unknown method: jarvis.schedule')
    })

    expect(store.$scheduleSync.get()).toBe('local')
    expect(store.$scheduleSyncError.get()).toContain('unknown method')
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

describe('gateway sync', () => {
  const roundTrip = (items: unknown[]) => async (_method: string, _params?: Record<string, unknown>) => ({ items })

  it('adopts the server list and reports itself synced', async () => {
    const store = await loadStore()
    const seen: string[] = []

    const request = async (method: string) => {
      seen.push(method)

      return {
        items: [
          {
            id: 'sched-server-1',
            title: 'Fly to Kolkata — BNPL client',
            date: '2026-11-09',
            time: '05:05',
            kind: 'travel',
            done: false,
            created_at: 1,
            updated_at: 1
          }
        ]
      }
    }

    expect(await store.hydrateSchedule(request)).toBe(true)
    expect(seen).toEqual(['jarvis.schedule'])
    expect(store.scheduleItems()).toHaveLength(1)
    expect(store.scheduleItems()[0]).toMatchObject({ date: '2026-11-09', kind: 'travel', time: '05:05' })
    expect(store.$scheduleSync.get()).toBe('synced')
    // The snapshot is cached, so the row still draws on the next cold start.
    expect(JSON.parse(localStorage.getItem(KEY)!)).toHaveLength(1)
  })

  it('keeps the cache and says so when the gateway is away', async () => {
    const store = await loadStore()
    store.addScheduleItem({ date: '2026-11-20', title: 'Kept locally' })

    const failing = async () => {
      throw new Error('offline')
    }

    expect(await store.hydrateSchedule(failing)).toBe(false)
    expect(store.scheduleItems().map(item => item.title)).toEqual(['Kept locally'])
    expect(store.$scheduleSync.get()).toBe('local')
  })

  it('drops unusable rows the gateway hands back', async () => {
    const store = await loadStore()
    await store.hydrateSchedule(
      roundTrip([
        { date: '2026-02-31', title: 'Bad day' },
        { date: '2026-11-20', title: 'Fine' }
      ])
    )

    expect(store.scheduleItems().map(item => item.title)).toEqual(['Fine'])
  })

  it('create adopts the id and timestamps the server mints', async () => {
    const store = await loadStore()
    let sent: Record<string, unknown> = {}

    const request = async (_method: string, params?: Record<string, unknown>) => {
      sent = (params?.item ?? {}) as Record<string, unknown>

      return {
        item: {
          id: 'sched-server-2',
          title: 'Fly to Kolkata — BNPL client',
          date: '2026-11-09',
          kind: 'travel',
          done: false,
          created_at: 7,
          updated_at: 7
        }
      }
    }

    const row = await store.createScheduleItem(request, {
      date: '2026-11-09',
      kind: 'travel',
      title: 'Fly to Kolkata — BNPL client'
    })

    expect(row?.id).toBe('sched-server-2')
    expect(store.scheduleItems()).toHaveLength(1)
    expect(store.scheduleItems()[0].id).toBe('sched-server-2')
    // A new entry carries no id: the server owns identity.
    expect(sent.id).toBeUndefined()
    expect(sent.source).toBe('desktop')
    expect(store.$scheduleSync.get()).toBe('synced')
  })

  it('keeps the optimistic row when the write fails, and marks it local', async () => {
    const store = await loadStore()

    const failing = async () => {
      throw new Error('offline')
    }

    const row = await store.createScheduleItem(failing, { date: '2026-11-20', title: 'Written offline' })

    expect(row).not.toBeNull()
    expect(store.scheduleItems().map(item => item.title)).toEqual(['Written offline'])
    expect(store.$scheduleSync.get()).toBe('local')
  })

  it('delete removes locally and tells the server', async () => {
    const store = await loadStore()
    const item = store.addScheduleItem({ date: '2026-11-20', title: 'Cancel this' })!
    const calls: Array<Record<string, unknown>> = []

    const request = async (_method: string, params?: Record<string, unknown>) => {
      calls.push(params ?? {})

      return { items: [], removed: true }
    }

    expect(await store.deleteScheduleItem(request, item.id)).toBe(true)
    expect(store.scheduleItems()).toEqual([])
    expect(calls).toEqual([{ action: 'remove', id: item.id }])
  })
})
