import { describe, expect, it } from 'vitest'
import type { Match, Player } from './data'
import { calculateLeaderboard } from './stats'

const players: Player[] = [
  { id: 'a', name: 'Ada', color: '#fff', initials: 'AD' },
  { id: 'b', name: 'Bea', color: '#fff', initials: 'BE' },
  { id: 'c', name: 'Ciro', color: '#fff', initials: 'CI' },
]

function match(id: string, results: Match['results']): Match {
  return { id, gameId: 'mk8', playedAt: '2026-09-30T18:00:00.000Z', duration: 30, results }
}

describe('calculateLeaderboard', () => {
  it('assegna una vittoria solo al punteggio massimo unico', () => {
    const rows = calculateLeaderboard(players, [match('m1', [
      { playerId: 'a', score: 10 }, { playerId: 'b', score: 7 }, { playerId: 'c', score: 2 },
    ])])
    expect(rows.map(({ name, wins, games, points }) => [name, wins, games, points])).toEqual([
      ['Ada', 1, 1, 10], ['Bea', 0, 1, 7], ['Ciro', 0, 1, 2],
    ])
  })

  it('conta tutti i co-vincitori come KingScore e ordina poi per punti', () => {
    const rows = calculateLeaderboard(players, [
      match('m1', [{ playerId: 'a', score: 8 }, { playerId: 'b', score: 8 }]),
      match('m2', [{ playerId: 'c', score: 4 }, { playerId: 'b', score: 1 }]),
    ])
    expect(rows.map(({ name, wins, games, points }) => [name, wins, games, points])).toEqual([
      ['Bea', 1, 2, 9], ['Ada', 1, 1, 8], ['Ciro', 1, 1, 4],
    ])
  })

  it('include i player senza partite e ignora risultati di account diversi', () => {
    const rows = calculateLeaderboard(players, [match('m1', [{ playerId: 'outside', score: 100 }])])
    expect(rows.map(({ name, wins, games, points }) => [name, wins, games, points])).toEqual([
      ['Ada', 0, 0, 0], ['Bea', 0, 0, 0], ['Ciro', 0, 0, 0],
    ])
  })
})
