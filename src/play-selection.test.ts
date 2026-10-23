import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AddPlayPage } from './add-play'
import type { Game, GameMode, Match, Player } from './data'
import { playSelectionError } from './game-rules'

const modes: GameMode[] = [{ id: 'race', name: 'Gara', active: true }, { id: 'old', name: 'Archiviata', active: false }]
const game: Game = { id: 'kart', name: 'Kart', platform: 'Switch', category: 'Corse', emoji: '🎮', accent: '#10b981', modes }
const players: Player[] = [{ id: 'a', name: 'Anna', initials: 'AN', color: '#10b981' }, { id: 'b', name: 'Bruno', initials: 'BR', color: '#38bdf8' }]
const play: Match = { id: 'play', gameId: game.id, modeId: null, playedAt: '2026-01-01T12:00:00Z', duration: 10, results: [{ playerId: 'a', score: 10, winner: true }, { playerId: 'b', score: 5, winner: false }] }
const form = (selectedGame = game, initialPlay = play) => renderToStaticMarkup(createElement(AddPlayPage, {
  games: [selectedGame], players, initialPlay, onSave: async () => {}, onCancel() {}, onAddPlayer() {}, onGames() {},
}))

describe('required play selections', () => {
  it('requires at least one explicitly selected participant winner', () => {
    for (const results of [[], [{ winner: false }], [{}], [{ winner: 'true' }], [{ winner: 1 }]]) {
      expect(playSelectionError([], null, results)).toContain('almeno un vincitore')
    }
    expect(playSelectionError([], null, [{ winner: true }, { winner: false }])).toBe('')
    expect(playSelectionError([], null, [{ winner: true }, { winner: true }])).toBe('')
    // The submit handler passes selected participants only, excluding a removed winner.
    const selected = play.results.filter(result => result.playerId === 'b')
    expect(playSelectionError([], null, selected)).toContain('almeno un vincitore')
  })

  it('requires a mode only for games with modes, including legacy edits', () => {
    expect(playSelectionError(modes, null, play.results)).toContain('Seleziona una modalità')
    expect(playSelectionError(modes, '', play.results)).toContain('Seleziona una modalità')
    expect(playSelectionError(modes, undefined, play.results)).toContain('Seleziona una modalità')
    expect(playSelectionError([], null, play.results)).toBe('')
    expect(playSelectionError(modes, 'race', play.results)).toBe('')
    expect(playSelectionError(modes, 'missing', play.results)).toContain('disponibile')
    expect(playSelectionError([], 'race', play.results)).toContain('disponibile')
  })

  it('retains an archived mode only for the play already using it', () => {
    expect(playSelectionError(modes, 'old', play.results)).toContain('disponibile')
    expect(playSelectionError(modes, 'old', play.results, 'race')).toContain('disponibile')
    expect(playSelectionError(modes, 'old', play.results, 'old')).toBe('')
    expect(playSelectionError([modes[1]], null, play.results)).toContain('Seleziona una modalità')
  })

  it('renders a required mode selector without the optional None choice', () => {
    const html = form()
    expect(html).toMatch(/<select[^>]*aria-label="Modalità di gioco"[^>]*required=""/)
    expect(html).toContain('Seleziona una modalità')
    expect(html).not.toContain('>Nessuna</option>')
    expect(html).toContain('Seleziona almeno un vincitore.')
    expect(html).toContain('aria-describedby="play-winner-help"')
    expect(form({ ...game, modes: [] })).not.toContain('aria-label="Modalità di gioco"')
  })

  it('explains why a game with only archived modes cannot be saved', () => {
    expect(form({ ...game, modes: [modes[1]] })).toContain('Attivane una nella gestione giochi prima di salvare.')
    const retained = form({ ...game, modes: [modes[1]] }, { ...play, modeId: 'old' })
    expect(retained).toContain('value="old" selected=""')
    expect(retained).not.toContain('Attivane una')
  })
})
