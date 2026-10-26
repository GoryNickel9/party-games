import { describe, expect, it } from 'vitest'
import { wrappedRecap } from '../api/_lib/mobile-wrapped'
import { simulateKingElo } from './king-elo-core'
import type { PartyData } from './data'

const data: PartyData = {
  players: [{ id: 'a', name: 'Alice', color: '#fff', initials: 'A' }, { id: 'b', name: 'Bob', color: '#fff', initials: 'B' }],
  games: [{ id: 'g', name: 'Gioco', platform: '', category: '', emoji: '', accent: '' }],
  matches: [
    { id: 'old', gameId: 'g', playedAt: '2025-12-01T12:00:00Z', duration: 30, results: [{ playerId: 'a', score: 2 }, { playerId: 'b', score: 1 }] },
    // In Rome this belongs to 2026, even though the UTC date is in 2025.
    { id: 'new', gameId: 'g', playedAt: '2025-12-31T23:30:00Z', duration: 90, results: [{ playerId: 'a', score: 1 }, { playerId: 'b', score: 2 }] },
    { id: 'coop', gameId: 'g', playedAt: '2026-01-01T14:00:00Z', duration: 15, cooperative: true, teamWon: true, results: [{ playerId: 'a', score: 5 }, { playerId: 'b', score: 5 }] },
    { id: 'other', gameId: 'g', playedAt: '2026-02-02T14:00:00Z', duration: 20, results: [{ playerId: 'b', score: 3 }] },
    { id: 'future', gameId: 'g', playedAt: '2027-01-01T14:00:00Z', duration: 10, results: [{ playerId: 'a', score: 3 }, { playerId: 'b', score: 1 }] },
  ],
}

describe('mobile Wrapped recap', () => {
  it('counts general totals and records in Rome without personal victory data', () => {
    const recap = wrappedRecap(data, 2026)
    expect(recap).toMatchObject({ matches: 3, minutes: 125, games: 1, wins: null, bestGame: null,
      topGame: { name: 'Gioco', matches: 3 }, topMonth: { name: 'Gennaio', matches: 2, minutes: 105, games: 1 },
      longest: { name: 'Gioco', minutes: 90 }, busiest: { day: '2026-01-01', matches: 2 } })
    expect(recap.ratings).toHaveLength(2)
  })
  it('filters personal plays, counts cooperative victories and carries historical ELO', () => {
    const recap = wrappedRecap(data, 2026, 'a')
    const history = simulateKingElo(data.players, data.matches, data.games).history
    expect(recap).toMatchObject({ matches: 2, minutes: 105, wins: 1, bestGame: { wins: 1 }, topGame: { wins: 1 } })
    expect(recap.ratings).toEqual([{ id: 'a', name: 'Alice', start: history[0].values.a, end: history[3].values.a }])
    expect(recap.ratings[0].start).not.toBe(1000)
    expect(recap.ratings[0].end).not.toBe(history.at(-1)!.values.a)
  })
  it('handles empty years and players with no matches without fabricated records', () => {
    for (const recap of [wrappedRecap(data, 2024), wrappedRecap(data, 2026, 'missing')]) {
      expect(recap).toMatchObject({ matches: 0, minutes: 0, games: 0, topGame: null, topMonth: null, longest: null, busiest: null, ratings: [] })
    }
  })
  it('uses deterministic dates for tied records independently of input order', () => {
    expect(wrappedRecap({ ...data, matches: [...data.matches].reverse() }, 2026)).toEqual(wrappedRecap(data, 2026))
  })
})
