import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import type { Game, Match, Player } from './data'
import { filterModeMatches, modeKey, modeLabel, validateModes } from './game-modes'
import { simulateKingElo } from './kingscore-elo'
import { AddPlayPage } from './add-play'
import { EloPage } from './public-recaps'

const modes = [{ id: 'race', name: 'Gara', active: true }, { id: 'battle', name: 'Battaglia', active: true }, { id: 'old', name: 'Vecchia', active: false }]
const game: Game = { id: 'kart', name: 'Kart', platform: 'Console', category: 'Corse', emoji: '🎮', accent: '#10b981', modes }
const players: Player[] = [{ id: 'a', name: 'Anna', initials: 'AN', color: '#10b981' }, { id: 'b', name: 'Bruno', initials: 'BR', color: '#38bdf8' }]
const play = (id: string, modeId: string | null, winner: string): Match => ({ id, gameId: game.id, modeId, duration: 10, playedAt: `2026-01-0${id}T12:00:00Z`, results: players.map(player => ({ playerId: player.id, score: player.id === winner ? 10 : 0, winner: player.id === winner })) })
const matches = [play('1', 'race', 'a'), play('2', 'battle', 'b'), play('3', 'race', 'a'), play('4', null, 'b')]

describe('game modes', () => {
  it('validates and trims names, retaining archived IDs', () => {
    expect(validateModes(modes)).toEqual(modes)
    expect(validateModes([{ id: 'race', name: ' Gara ', active: true }])[0].name).toBe('Gara')
  })
  it('accepts games without modes and rejects duplicate names and malformed input', () => {
    expect(validateModes([])).toEqual([])
    expect(validateModes([{ id: 'x', name: 'Gara', active: false }])).toHaveLength(1)
    for (const input of [null, ['Gara'], [{ id: 'x', name: 'X', active: true }], [...modes, { id: 'other', name: ' GARA ', active: true }], [...modes, { id: 'race', name: 'Altra', active: true }], [{ id: 'x', name: 'Gara', active: 'yes' }], Array.from({ length: 31 }, (_, i) => ({ id: String(i), name: `Modo ${i}`, active: true }))]) expect(() => validateModes(input)).toThrow()
    for (const id of ['all', 'legacy']) expect(() => validateModes([{ id, name: 'Gara', active: true }])).toThrow('riservato')
  })
  it('keeps legacy matches separate and filters without changing input', () => {
    expect(filterModeMatches(matches, 'kart', 'race').map(match => match.id)).toEqual(['1', '3'])
    expect(filterModeMatches(matches, 'kart', null).map(match => match.id)).toEqual(['4'])
    expect(filterModeMatches(matches, 'kart', 'all')).toHaveLength(4)
    expect(filterModeMatches(matches, 'other', 'race')).toEqual([])
    expect(matches).toHaveLength(4)
  })
  it('resolves archived modes and does not guess legacy modes', () => {
    expect(modeLabel(game, 'old')).toBe('Vecchia')
    expect(modeLabel(game, null)).toBe('')
    expect(modeKey('kart', undefined)).toBe(modeKey('kart', null))
    expect(modeKey('a:b', 'c')).not.toBe(modeKey('a', 'b:c'))
  })
  it('trains independent mode ratings without changing aggregate game/general ELO', () => {
    const elo = simulateKingElo(players, matches)
    const race = elo.perMode[modeKey('kart', 'race')]
    const battle = elo.perMode[modeKey('kart', 'battle')]
    expect(race.a).toMatchObject({ games: 2, wins: 2, rating: 1045 })
    expect(battle.a).toMatchObject({ games: 1, losses: 1, rating: 976 })
    expect(elo.perMode[modeKey('kart', null)].a).toMatchObject({ games: 1, rating: 976 })
    expect(elo.perModeHistory[modeKey('kart', 'race')]).toHaveLength(2)
    const withoutModes = simulateKingElo(players, matches.map(({ modeId: _modeId, ...match }) => match))
    expect(elo.general).toEqual(withoutModes.general)
    expect(elo.perGame).toEqual(withoutModes.perGame)
    expect(elo.history).toEqual(withoutModes.history)
    expect(elo.perGameHistory).toEqual(withoutModes.perGameHistory)
  })
  it('hides the mode selector for games without modes and removes source and cooperation', () => {
    const html = renderToStaticMarkup(createElement(AddPlayPage, { games: [{ ...game, modes: [] }], players, initialPlay: { ...matches[0], modeId: null }, onSave: async () => {}, onCancel: () => {}, onAddPlayer: () => {}, onGames: () => {} }))
    for (const text of ['aria-label="Modalità di gioco"', 'Esito cooperativo', 'Fonte', 'Modalità non specificata']) expect(html).not.toContain(text)
  })
  it('offers aggregate, active, archived and legacy leaderboard scopes', () => {
    const html = renderToStaticMarkup(createElement(EloPage, { data: { games: [game], players, matches }, admin: false, demo: true }))
    expect(html).toContain('Modalità della classifica')
    expect(html).toContain('Tutte le modalità')
    expect(html).toContain('Battaglia')
    expect(html).toContain('Vecchia (archiviata)')
    expect(html).not.toContain('Modalità non specificata')
  })
  it('makes modes selectable on the leaderboard before the first match', () => {
    const html = renderToStaticMarkup(createElement(EloPage, { data: { games: [game], players, matches: [] }, admin: false, demo: true }))
    expect(html).toContain('Modalità della classifica')
    expect(html).toContain('Battaglia')
    expect(html).toContain('Nessun rating ELO disponibile')
  })
})
