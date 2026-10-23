import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Game, Match, Player } from './data'
import { lowerScoreWins, rankedMatchResults } from './game-rules'
import { modeKey } from './game-modes'
import { simulateKingElo } from './kingscore-elo'
import { simulationInputs } from './king-elo-core'
import { simulateAllPlays } from './elo/simulation'
import { simulateModePlays } from './elo/mode-simulation'
import { getPlayElo } from './play-elo'
import { initialWinners } from './play-form'
import { PlayDetailPage } from './play-detail'
import { PlayHistoryCard } from './play-history'
import { calculatePartyAnalytics } from './analytics'

const players: Player[] = ['KetoGhost', 'Il Fattone', 'GoryNickel'].map((name, i) => ({ id: String(i), name, initials: name[0], color: '#10b981' }))
const game: Game = { id: 'sports', name: 'Nintendo Switch Sports Resort', platform: 'Switch', category: 'Sport', emoji: '🎮', accent: '#10b981', modes: [
  ...[3, 9, 18].map(holes => ({ id: `golf-${holes}`, name: `Golf (${holes} buche)`, active: true })),
  { id: 'bowling', name: 'Bowling', active: true },
] }
const play: Match = { id: 'golf', gameId: game.id, modeId: 'golf-3', playedAt: '2026-01-02T12:00:00Z', duration: 10, results: [
  { playerId: '0', score: 5, winner: true, position: 1 },
  { playerId: '2', score: 10, winner: false, position: 2 },
  { playerId: '1', score: 6, winner: false, position: 3 },
] }
const detail = (match: Match, selectedGame = game, matches = [match]) => renderToStaticMarkup(createElement(PlayDetailPage, {
  match, game: selectedGame, games: [selectedGame], players, matches, account: null, demo: true,
  onBack() {}, onDeleted() {}, onLogin() {},
}))

describe('Golf scoring and three ELO scopes', () => {
  it.each([3, 9, 18])('ranks %i holes from lowest score and fixes historical positions', holes => {
    const match = { ...play, modeId: `golf-${holes}` }
    expect(rankedMatchResults(match, game).map(result => [result.playerId, result.position])).toEqual([['0', 1], ['1', 2], ['2', 3]])
    const html = detail(match)
    expect(html.indexOf('KetoGhost')).toBeLessThan(html.indexOf('Il Fattone'))
    expect(html.indexOf('Il Fattone')).toBeLessThan(html.indexOf('GoryNickel'))
    const elo = simulateKingElo(players, [match], [game])
    for (const ratings of [elo.perGame[game.id], elo.perMode[modeKey(game.id, match.modeId)], elo.general]) {
      expect(ratings['0'].rating).toBe(1024)
      expect(ratings['1'].rating).toBe(1000)
      expect(ratings['2'].rating).toBe(976)
    }
    expect(play.results.map(result => result.position)).toEqual([1, 2, 3])
  })

  it('infers low-score winners, including ties, without overriding explicit outcomes', () => {
    const implicit = { ...play, results: play.results.map(({ winner: _winner, ...result }) => result) }
    expect(initialWinners(implicit, game)).toEqual(['0'])
    const tied = { ...implicit, results: implicit.results.map(result => ({ ...result, score: result.playerId === '2' ? 10 : 5 })) }
    expect(rankedMatchResults(tied, game).filter(result => result.position === 1).map(result => result.playerId)).toEqual(['0', '1'])
    expect(initialWinners({ ...play, results: play.results.map(result => ({ ...result, winner: false })) }, game)).toEqual([])
    expect(rankedMatchResults(play, game).map(result => result.playerId)).toEqual(['0', '1', '2'])
  })

  it('keeps descending scores for Bowling and recognizes a standalone Golf game', () => {
    expect(rankedMatchResults({ ...play, modeId: 'bowling' }, game).map(result => result.playerId)).toEqual(['0', '2', '1'])
    expect(lowerScoreWins('Golf')).toBe(true)
    expect(lowerScoreWins(game.name, 'GOLF (9 buche)')).toBe(true)
    expect(lowerScoreWins(game.name, 'Bowling')).toBe(false)
    expect(lowerScoreWins('Minigolf')).toBe(false)
  })

  it('uses the same score direction in both server-side simulators', () => {
    const inputs = simulationInputs(players, [play], [game])
    expect(inputs[0].lower_score_wins).toBe(true)
    expect(simulateAllPlays(inputs).gamePlayers[game.id]['1'].rating).toBe(1000)
    expect(simulateModePlays(inputs).gamePlayers[modeKey(game.id, play.modeId)]['2'].rating).toBe(976)
  })

  it('shows historical mode, game and general ELO independently', () => {
    const otherGame = { ...game, id: 'other', name: 'Kart', modes: [] }
    const matches: Match[] = [
      { ...play, id: 'other', gameId: 'other', modeId: null, playedAt: '2025-12-31T12:00:00Z' },
      { ...play, id: 'bowling', modeId: 'bowling', playedAt: '2026-01-01T12:00:00Z' },
      play,
    ]
    const elo = getPlayElo(players, matches, play.id, [game, otherGame])
    expect(elo.mode['0']).toEqual({ rating: 1024, ratingChange: 24 })
    expect(elo.game['0']).toEqual({ rating: 1046, ratingChange: 22 })
    expect(elo.general['0']).toEqual({ rating: 1039, ratingChange: 15 })
    const next = { ...play, id: 'later', playedAt: '2026-01-03T12:00:00Z' }
    expect(getPlayElo(players, [...matches, next], play.id, [game, otherGame])).toEqual(elo)
    const html = detail(play)
    expect(html.match(/<th>/g)).toHaveLength(7)
    for (const label of ['ELO modalità', 'ELO gioco', 'ELO Generale']) expect(html).toContain(`<th>${label}</th>`)
    const noMode = detail({ ...play, modeId: null })
    expect(noMode).toContain('<th>ELO modalità</th>')
    expect(noMode).toContain('<th>ELO gioco</th>')
    expect(noMode.match(/<th>/g)).toHaveLength(7)
    expect(noMode.match(/<span class="muted">-<\/span>/g)).toHaveLength(3)
    expect(noMode).toContain('questa partita non ha una modalità associata')
    const noModes = detail({ ...play, modeId: null }, { ...game, modes: [] })
    expect(noModes.match(/<th>/g)).toHaveLength(6)
    expect(noModes).toContain('<th>ELO</th>')
    expect(noModes).not.toContain('<th>ELO gioco</th>')
    expect(getPlayElo(players, [{ ...play, modeId: null }], play.id, [game]).mode).toEqual({})
  })

  it('retains all three ELO labels when every mode is archived', () => {
    const html = detail({ ...play, modeId: null }, { ...game, modes: game.modes!.map(mode => ({ ...mode, active: false })) })
    for (const label of ['ELO modalità', 'ELO gioco', 'ELO Generale']) expect(html).toContain(`<th>${label}</th>`)
    expect(html.match(/<span class="muted">-<\/span>/g)).toHaveLength(3)
  })

  it('orders history scores and attributes inferred wins in analytics to the lowest score', () => {
    const implicit = { ...play, results: play.results.map(({ winner: _winner, ...result }) => result) }
    const html = renderToStaticMarkup(createElement(PlayHistoryCard, { play: implicit, game, players: new Map(players.map(player => [player.id, player])), onOpen() {} }))
    expect(html.indexOf('KetoGhost: 5')).toBeLessThan(html.indexOf('Il Fattone: 6'))
    expect(html.indexOf('Il Fattone: 6')).toBeLessThan(html.indexOf('GoryNickel: 10'))
    const analytics = calculatePartyAnalytics(players, [game], [implicit])
    expect(analytics.players.find(entry => entry.player.id === '0')?.wins).toBe(1)
    expect(analytics.players.find(entry => entry.player.id === '2')?.wins).toBe(0)
  })
})
