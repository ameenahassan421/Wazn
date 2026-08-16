import { describe, expect, it, beforeEach, vi } from 'vitest'

/**
 * What the client sends, and what it does when the table is not there yet.
 *
 * Two classes of defect, both of which have actually happened in this
 * codebase:
 *
 *   `social.ts` — the payload was never tested and the owner column was
 *   missing from every insert for the life of the feature. The upsert
 *   assertions below are the same guard for the four new tables.
 *
 *   `coach.ts` — an RPC that does not exist came back as `[]` through some
 *   stacks, `[]` is truthy, and reading a field off it took down the Log
 *   screen. Every read here has to answer "nothing" for that shape.
 */

const writes: { table: string; payload: unknown; options: unknown }[] = []
let rpcResult: { data: unknown; error: unknown } = { data: null, error: null }
let selectResult: { data: unknown; error: unknown } = { data: null, error: null }
let writeError: unknown = null
let throwOnCall = false

vi.mock('./supabase', () => {
  function builder(table: string) {
    const chain = {
      upsert(payload: unknown, options: unknown) {
        if (throwOnCall) throw new Error('offline')
        writes.push({ table, payload, options })
        return Promise.resolve({ data: null, error: writeError })
      },
      select() {
        return chain
      },
      eq() {
        return chain
      },
      maybeSingle() {
        if (throwOnCall) throw new Error('offline')
        return Promise.resolve(selectResult)
      },
    }
    return chain
  }
  return {
    db: () => ({
      from: (table: string) => builder(table),
      rpc: () => {
        if (throwOnCall) throw new Error('offline')
        return Promise.resolve(rpcResult)
      },
    }),
  }
})

const {
  fetchBodyOverview,
  fetchCheckIn,
  localDay,
  logCheckIn,
  logMeasurement,
  logProtein,
  logWeighIn,
} = await import('./body-store')

beforeEach(() => {
  writes.length = 0
  rpcResult = { data: null, error: null }
  selectResult = { data: null, error: null }
  writeError = null
  throwOnCall = false
})

describe('localDay', () => {
  it('is the local calendar day, not UTC', () => {
    // A 9pm weigh-in in Cairo must not be filed under tomorrow.
    const late = new Date(2026, 7, 14, 21, 30)
    expect(localDay(late)).toBe('2026-08-14')
  })

  it('pads single-digit months and days', () => {
    expect(localDay(new Date(2026, 0, 5, 12))).toBe('2026-01-05')
  })
})

describe('reads answer "nothing" rather than throwing', () => {
  it('returns empty series when the RPC errors', async () => {
    rpcResult = { data: null, error: { message: 'function does not exist' } }
    expect(await fetchBodyOverview()).toEqual({
      weights: [],
      protein: [],
      measurements: [],
    })
  })

  it('returns empty series for the `[]` shape a missing RPC can produce', async () => {
    // The exact shape that took the Log screen down once: truthy, and not an
    // object with the fields the caller is about to read.
    rpcResult = { data: [], error: null }
    expect(await fetchBodyOverview()).toEqual({
      weights: [],
      protein: [],
      measurements: [],
    })
  })

  it('returns empty series when the call throws outright', async () => {
    throwOnCall = true
    expect((await fetchBodyOverview()).weights).toEqual([])
    expect(await fetchCheckIn()).toBeNull()
  })

  it('passes through the three series when they are there', async () => {
    rpcResult = {
      data: {
        weights: [{ on: '2026-08-14', kg: 82.1 }],
        protein: [{ on: '2026-08-14', g: 168, target: 160 }],
        measurements: [{ site: 'chest', cm: 104, on: '2026-08-14', previous_cm: 103 }],
      },
      error: null,
    }
    const body = await fetchBodyOverview()
    expect(body.weights).toHaveLength(1)
    expect(body.protein).toHaveLength(1)
    expect(body.measurements).toHaveLength(1)
  })

  it('tolerates a field that is not an array', async () => {
    rpcResult = { data: { weights: null, protein: 'nope' }, error: null }
    const body = await fetchBodyOverview()
    expect(body.weights).toEqual([])
    expect(body.protein).toEqual([])
  })
})

describe('the check-in', () => {
  it('reads today’s tap', async () => {
    selectResult = { data: { state: 'drained' }, error: null }
    expect(await fetchCheckIn('2026-08-14')).toBe('drained')
  })

  it('refuses a state this build does not know', async () => {
    selectResult = { data: { state: 'exhausted' }, error: null }
    expect(await fetchCheckIn('2026-08-14')).toBeNull()
  })

  it('is null when nobody has tapped — which reads as Normal, silently', async () => {
    selectResult = { data: null, error: null }
    expect(await fetchCheckIn('2026-08-14')).toBeNull()
  })

  it('writes one row per day, upserting on the owner and the day', async () => {
    expect(await logCheckIn('fresh', '2026-08-14')).toBe(true)
    expect(writes).toEqual([
      {
        table: 'daily_checkins',
        payload: { day: '2026-08-14', state: 'fresh' },
        options: { onConflict: 'user_id,day' },
      },
    ])
  })

  it('reports failure without throwing mid-warm-up', async () => {
    writeError = { message: 'relation does not exist' }
    expect(await logCheckIn('fresh', '2026-08-14')).toBe(false)
    throwOnCall = true
    expect(await logCheckIn('fresh', '2026-08-14')).toBe(false)
  })
})

describe('what the writes actually send', () => {
  it('stores body weight in kilograms under the local day', async () => {
    await logWeighIn(82.1, '2026-08-14')
    expect(writes[0]).toEqual({
      table: 'body_weights',
      payload: { measured_on: '2026-08-14', weight_kg: 82.1 },
      options: { onConflict: 'user_id,measured_on' },
    })
  })

  it('stamps the target on the protein row rather than leaving it to be re-read', async () => {
    await logProtein(168, 160, '2026-08-14')
    expect(writes[0].payload).toEqual({
      day: '2026-08-14',
      grams: 168,
      target_g: 160,
    })
  })

  it('keys a measurement by site as well as day', async () => {
    await logMeasurement('waist', 84, '2026-08-14')
    expect(writes[0]).toEqual({
      table: 'body_measurements',
      payload: { site: 'waist', measured_on: '2026-08-14', value_cm: 84 },
      options: { onConflict: 'user_id,site,measured_on' },
    })
  })

  it('never names user_id — the column default owns that (0016’s lesson)', async () => {
    await logWeighIn(82.1, '2026-08-14')
    await logProtein(168, 160, '2026-08-14')
    await logMeasurement('waist', 84, '2026-08-14')
    await logCheckIn('fresh', '2026-08-14')
    for (const write of writes) {
      expect(Object.keys(write.payload as object)).not.toContain('user_id')
    }
  })
})
