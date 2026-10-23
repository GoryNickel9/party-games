import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const mocks = vi.hoisted(() => ({ sql: Object.assign(vi.fn(), { transaction: vi.fn() }), recalculateElo: vi.fn(), modeName: 'Golf (3 buche)', hasModes: true, modeActive: true }))
vi.mock('../api/_lib/db', () => ({ sql: mocks.sql }))
vi.mock('../api/_lib/auth', () => ({ requireAdmin: async () => ({ id: 'admin' }) }))
vi.mock('../api/_lib/elo', () => ({ recalculateElo: mocks.recalculateElo }))
import saveMatch from '../api/matches'

const ids = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003']

beforeEach(() => {
  vi.clearAllMocks()
  mocks.modeName = 'Golf (3 buche)'
  mocks.hasModes = true
  mocks.modeActive = true
  mocks.recalculateElo.mockResolvedValue({ processed: 1 })
  mocks.sql.mockImplementation(async (strings: TemplateStringsArray) => {
    const query = strings.join('')
    if (query.startsWith('select id,name from public.games')) return [{ id: 'sports', name: 'Nintendo Switch Sports Resort' }]
    if (query.startsWith('select id,name,active from public.game_modes')) return mocks.hasModes ? [{ id: 'mode', name: mocks.modeName, active: mocks.modeActive }] : []
    if (query.startsWith('select id from public.players')) return ids.map(id => ({ id }))
    if (query.startsWith('select id,game_id,mode_id from public.plays')) return [{ id: ids[0], game_id: 'sports', mode_id: 'mode' }]
    return []
  })
  mocks.sql.transaction.mockImplementation(async (queries: Promise<unknown>[]) => Promise.all(queries))
})

async function save({ method = 'POST', winners = [true, false, false], modeId = 'mode' }: { method?: string; winners?: unknown[]; modeId?: string | null } = {}) {
  const response = { code: 200, body: {} as unknown, status(code: number) { this.code = code; return this }, json(body: unknown) { this.body = body; return this } }
  await saveMatch({ method, query: {}, body: { id: ids[0], gameId: 'sports', modeId, playedAt: '2026-01-01T12:00:00Z', results: [
    { playerId: ids[0], score: 5, winner: winners[0] },
    { playerId: ids[2], score: 10, winner: winners[1] },
    { playerId: ids[1], score: 6, winner: winners[2] },
  ] } } as unknown as VercelRequest, response as unknown as VercelResponse)
  const inserts = mocks.sql.mock.calls.filter(([strings]) => strings.join('').startsWith('insert into public.play_scores'))
  return { response, rows: inserts.map(([, , playerId, score, winner, position]) => ({ playerId, score, winner, position })) }
}

describe('Golf API writes', () => {
  it.each([3, 9, 18])('saves %i-hole scores with ascending positions and selected winner', async holes => {
    mocks.modeName = `Golf (${holes} buche)`
    const { response, rows } = await save()
    expect(response).toMatchObject({ code: 201, body: { eloUpdated: true } })
    expect(rows).toEqual([
      { playerId: ids[0], score: 5, winner: true, position: 1 },
      { playerId: ids[2], score: 10, winner: false, position: 3 },
      { playerId: ids[1], score: 6, winner: false, position: 2 },
    ])
    expect(mocks.recalculateElo).toHaveBeenCalledOnce()
  })

  it('corrects positions on edits while preserving selected winners', async () => {
    const { response, rows } = await save({ method: 'PATCH' })
    expect(response.code).toBe(200)
    expect(rows.map(row => row.position)).toEqual([1, 3, 2])
    expect(rows.map(row => row.winner)).toEqual([true, false, false])
  })

  it('retains descending scores for other modes in the same game', async () => {
    mocks.modeName = 'Bowling'
    const { rows } = await save({ winners: [false, true, false] })
    expect(rows.map(row => row.position)).toEqual([3, 1, 2])
    expect(rows.map(row => row.winner)).toEqual([false, true, false])
  })

  it.each(['POST', 'PATCH'])('rejects %s without an explicit participant winner', async method => {
    for (const winners of [[], [false, false, false], ['true', 1, null]]) {
      const { response, rows } = await save({ method, winners })
      expect(response).toMatchObject({ code: 400, body: { error: 'Seleziona almeno un vincitore tra i giocatori della partita.' } })
      expect(rows).toEqual([])
    }
    expect(mocks.sql.transaction).not.toHaveBeenCalled()
    expect(mocks.recalculateElo).not.toHaveBeenCalled()
  })

  it.each(['POST', 'PATCH'])('rejects %s without a mode for a game with modes', async method => {
    const { response, rows } = await save({ method, modeId: null })
    expect(response).toMatchObject({ code: 400, body: { error: 'Seleziona una modalità per questo gioco.' } })
    expect(rows).toEqual([])
    expect(mocks.sql.transaction).not.toHaveBeenCalled()
    expect(mocks.recalculateElo).not.toHaveBeenCalled()
  })

  it('allows a game with no modes and multiple explicitly selected winners', async () => {
    mocks.hasModes = false
    const { response, rows } = await save({ modeId: null, winners: [true, false, true] })
    expect(response.code).toBe(201)
    expect(rows.map(row => row.position)).toEqual([1, 3, 1])
  })

  it('rejects an archived mode for a new play but retains it on edits', async () => {
    mocks.modeActive = false
    expect((await save()).response.code).toBe(400)
    expect((await save({ method: 'PATCH' })).response.code).toBe(200)
  })

  it('rejects modes that are absent from the selected game', async () => {
    expect((await save({ modeId: 'other-game-mode' })).response.code).toBe(400)
    mocks.hasModes = false
    expect((await save()).response.code).toBe(400)
  })
})
