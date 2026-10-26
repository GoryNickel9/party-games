import { describe, expect, it } from 'vitest'
import { dashboard, eloTable, matchesPage } from '../api/_lib/mobile'
import type { PartyData } from './data'
import { simulateKingElo } from './king-elo-core'
import { getPlayElo } from './play-elo'

const data: PartyData = {
  players: [{ id: 'a', name: 'Alice', initials: 'AL', color: '#10b981' }, { id: 'b', name: 'Bob', alias: 'Bobby', initials: 'BO', color: '#38bdf8' }],
  games: [{ id: 'golf', name: 'Golf', platform: 'Switch', category: 'Sport', emoji: '', accent: '#10b981', modes: [{ id: 'nine', name: '9 buche', active: false }] }],
  matches: [
    { id: 'new', gameId: 'golf', modeId: 'nine', playedAt: '2026-09-30T22:30:00Z', duration: 20, results: [{ playerId: 'a', score: 8 }, { playerId: 'b', score: 12 }] },
    { id: 'old', gameId: 'golf', playedAt: '2026-09-12T12:00:00Z', duration: 15, results: [{ playerId: 'a', score: 4 }, { playerId: 'b', score: 4 }] },
  ],
}

describe('native read model', () => {
  it('ranks favorite game-mode pairs independently, with deterministic ties and a top-three limit', () => {
    const repeat = (gameId: string, modeId: string | null, count: number, prefix: string) => Array.from({ length: count }, (_, i) => ({ ...data.matches[0], id: `${prefix}-${i}`, gameId, modeId }))
    const sample: PartyData = { ...data,
      games: [data.games[0], { ...data.games[0], id: 'kart', name: 'Kart', platform: 'Switch 2' }],
      matches: [...repeat('golf', 'nine', 3, 'a'), ...repeat('golf', 'another', 2, 'b'), ...repeat('kart', 'nine', 3, 'c'), ...repeat('golf', null, 1, 'd')],
    }
    const result = dashboard(sample).favoriteModes
    expect(result).toHaveLength(3)
    expect(result.map(item => [item.game.id, item.modeId, item.count])).toEqual([['golf', 'nine', 3], ['kart', 'nine', 3], ['golf', 'another', 2]])
    expect(result[0]).toMatchObject({ modeName: '9 buche (archiviata)', game: { name: 'Golf', platform: 'Switch' } })
    expect(result[1].game.platform).toBe('Switch 2')
    expect(result[2].modeName).toBe('Modalità non disponibile')
    expect(dashboard({ ...sample, matches: [...sample.matches].reverse() }).favoriteModes).toEqual(result)
  })
  it('keeps unassigned matches together and returns active mode names without an archived label', () => {
    const sample = { ...data, games: [{ ...data.games[0], modes: [{ id: 'nine', name: '9 buche', active: true }] }],
      matches: [data.matches[0], { ...data.matches[1], id: 'no-mode-1', modeId: null }, { ...data.matches[1], id: 'no-mode-2' }],
    }
    expect(dashboard(sample).favoriteModes.map(item => [item.modeId, item.modeName, item.count])).toEqual([[null, 'Senza modalità', 2], ['nine', '9 buche', 1]])
    expect(dashboard({ players: [], games: [], matches: [] }).favoriteModes).toEqual([])
  })
  it('uses Rome month boundaries, zero-filled months and server-resolved Golf winners', () => {
    const result = dashboard(data, new Date('2026-10-01T12:00:00Z'))
    expect(result.totalMatches).toBe(2)
    expect(result.months).toHaveLength(12)
    expect(result.months.at(-1)).toEqual({ key: '2026-10', label: 'Ott', matches: 1 })
    expect(result.months.at(-2)?.matches).toBe(1)
    expect(result.victories[0]).toMatchObject({ player: { id: 'a' }, wins: 1, winRate: 100 })
    expect(result.recent[0].results.find(r => r.playerId === 'a')).toMatchObject({ winner: true, position: 1 })
    expect(result.favorites[0].count).toBe(2)
  })
  it('filters before paginating and preserves archived modes and ties', () => {
    expect(matchesPage(data, { search: 'bobby', mode: 'nine', year: '2026', month: '10' })).toMatchObject({ total: 1, page: 1 })
    const result = matchesPage(data, { search: 'GOLF', month: '9', page: '999' })
    expect(result).toMatchObject({ page: 1, totalPages: 1, total: 1 })
    expect(result.items[0].results.every(r => r.winner)).toBe(true)
    expect(matchesPage(data, { search: 'missing' }).items).toEqual([])
  })
  it('returns exactly the web simulator ratings, including independent mode ratings', () => {
    const expected = simulateKingElo(data.players, data.matches, data.games)
    expect(eloTable(data).rows.find(r => r.player.id === 'a')?.rating).toBe(expected.general.a.rating)
    expect(eloTable(data, 'golf', 'nine').rows.find(r => r.player.id === 'b')?.rating).toBe(expected.perMode['["golf","nine"]'].b.rating)
  })
  it('includes historical ELO and changes in dashboard and filtered history, matching the web detail', () => {
    const recent = dashboard(data, new Date('2026-10-01')).recent
    const filtered = matchesPage(data, { mode: 'nine' }).items[0]
    expect(filtered).toEqual(recent[0])
    expect(filtered.results.find(r => r.playerId === 'a')?.elo).toEqual({
      mode: { rating: 1024, ratingChange: 24 }, game: { rating: 1048, ratingChange: 24 }, general: { rating: 1048, ratingChange: 24 },
    })
    expect(filtered.results.find(r => r.playerId === 'b')?.elo.game).toEqual({ rating: 1000, ratingChange: -24 })
    for (const play of recent) {
      const web = getPlayElo(data.players, data.matches, play.id, data.games)
      for (const result of play.results) {
        expect(result.elo).toEqual({ mode: web.mode[result.playerId] ?? null, game: web.game[result.playerId] ?? null, general: web.general[result.playerId] ?? null })
      }
    }
    expect(recent[1].results[0].elo).toEqual({ mode: null, game: { rating: 1024, ratingChange: 24 }, general: { rating: 1024, ratingChange: 24 } })
  })
  it('uses the entire history before pagination, without including future ratings in old matches', () => {
    const matches = Array.from({ length: 23 }, (_, index) => ({ ...data.matches[0], id: `play-${index}`, playedAt: `2026-10-${String(index + 1).padStart(2, '0')}T12:00:00Z` }))
    const full = { ...data, matches }
    const lastPage = matchesPage(full, { page: '2' })
    expect(lastPage.items).toHaveLength(3)
    expect(lastPage.items.at(-1)?.results[0].elo.game).toEqual({ rating: 1024, ratingChange: 24 })
    const web = getPlayElo(data.players, matches.slice(0, 3), 'play-2', data.games)
    expect(lastPage.items[0].results[0].elo.game).toEqual(web.game.a)
  })
  it('handles an empty database and a December/January boundary', () => {
    const result = dashboard({ players: [], games: [], matches: [] }, new Date('2025-12-31T23:30:00Z'))
    expect(result.months.at(-1)?.key).toBe('2026-01')
    expect(result.months[0].key).toBe('2025-02')
    expect(result.victories).toEqual([])
    expect(result.favorites).toEqual([])
  })
  it('keeps cooperative failures out of monthly victories', () => {
    const cooperative = { ...data, matches: [{ ...data.matches[0], cooperative: true, teamWon: false }] }
    expect(dashboard(cooperative, new Date('2026-10-01')).victories.every(v => v.wins === 0)).toBe(true)
    expect(matchesPage(cooperative, {}).items[0].results.every(r => !r.winner)).toBe(true)
  })
})
