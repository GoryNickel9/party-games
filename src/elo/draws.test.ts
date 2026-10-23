import { describe, expect, it } from 'vitest'
import { simulateAllPlays, type SimulationPlay } from './simulation'
import { simulateModePlays } from './mode-simulation'
import { simulateKingElo } from '../king-elo-core'
import { modeKey } from '../game-modes'
import type { Game, Match, Player } from '../data'

describe('conteggio dei pareggi al primo posto', () => {
  it.each([true, false, null, undefined])('conta i co-vincitori come pareggi con draw=%s', draw => {
    const play: SimulationPlay & { mode_id: string } = {
      id: 'tie', game_id: 'game', mode_id: 'mode', played_at: '2026-10-23T12:00:00Z',
      play_scores: [
        { player_id: 'a', winner: true, draw, score: 10, position: 1 },
        { player_id: 'b', winner: true, draw, score: 8, position: 1 },
        { player_id: 'c', winner: false, score: 5, position: 3 },
        { player_id: 'd', winner: false, score: 5, position: 4 },
      ],
    }
    const result = simulateAllPlays([play])
    const modes = simulateModePlays([play])
    for (const ratings of [result.gamePlayers.game, result.generalPlayers, modes.gamePlayers[modeKey('game', 'mode')]]) {
      for (const id of ['a', 'b']) expect(ratings[id]).toMatchObject({ gamesPlayed: 1, wins: 0, draws: 1, losses: 0 })
      for (const id of ['c', 'd']) expect(ratings[id]).toMatchObject({ gamesPlayed: 1, wins: 0, draws: 0, losses: 1 })
      for (const state of Object.values(ratings)) expect(state.wins + state.draws + state.losses).toBe(state.gamesPlayed)
    }
    expect(play.play_scores![0].draw).toBe(draw)
  })

  it('non conta come pareggio i punteggi uguali dei soli perdenti', () => {
    const result = simulateAllPlays([{
      id: 'win', game_id: 'game', played_at: '2026-10-23T12:00:00Z',
      play_scores: [
        { player_id: 'a', winner: true, score: 10, position: 1 },
        { player_id: 'b', winner: false, score: 5, position: 2 },
        { player_id: 'c', winner: false, score: 5, position: 3 },
      ],
    }])
    expect(result.generalPlayers.a).toMatchObject({ wins: 1, draws: 0, losses: 0 })
    for (const id of ['b', 'c']) expect(result.generalPlayers[id]).toMatchObject({ wins: 0, draws: 0, losses: 1 })
  })

  it.each(['Bowling', 'Golf'])('propaga pareggi espliciti e dedotti ai tre ambiti ELO per %s', name => {
    const players: Player[] = ['a', 'b', 'c'].map(id => ({ id, name: id, initials: id, color: '#fff' }))
    const game: Game = { id: 'game', name, platform: 'Switch', category: 'Sport', emoji: '🎮', accent: '#fff', modes: [{ id: 'mode', name, active: true }] }
    const results = players.map(player => ({ playerId: player.id, score: player.id === 'c' ? (name === 'Golf' ? 10 : 0) : 5 }))
    const matches: Match[] = [
      { id: 'implicit', gameId: game.id, modeId: 'mode', playedAt: '2026-10-22T12:00:00Z', duration: 10, results },
      { id: 'explicit', gameId: game.id, modeId: 'mode', playedAt: '2026-10-23T12:00:00Z', duration: 10,
        results: results.map(result => ({ ...result, winner: result.playerId !== 'c', draw: result.playerId !== 'c' })) },
    ]
    const elo = simulateKingElo(players, matches, [game])
    for (const ratings of [elo.perGame.game, elo.perMode[modeKey('game', 'mode')], elo.general]) {
      for (const id of ['a', 'b']) expect(ratings[id]).toMatchObject({ games: 2, wins: 0, draws: 2, losses: 0 })
      expect(ratings.c).toMatchObject({ games: 2, wins: 0, draws: 0, losses: 2 })
    }
  })
})
