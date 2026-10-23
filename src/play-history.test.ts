import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { filterPlays, PlayHistoryCard, PlayHistoryPage, type PlayFilters } from './play-history'
import type { PartyData } from './data'

const data: PartyData = {
  games: [{ id: 'kart', name: 'Mario Kart World', platform: 'Nintendo Switch 2', category: 'Corse', emoji: '🎮', accent: '#10b981', modes: [{ id: 'gp', name: 'Gran Premio', active: true }] }],
  players: [{ id: 'a', name: 'Anna', alias: 'KartQueen', initials: 'AN', color: '#10b981' }, { id: 'b', name: 'Bruno', initials: 'BR', color: '#38bdf8' }],
  matches: [
    { id: 'new', gameId: 'kart', modeId: 'gp', playedAt: '2026-10-02T12:00:00Z', duration: 35, notes: 'Una rimonta', location: 'Casa', results: [{ playerId: 'a', score: 42, winner: true }, { playerId: 'b', score: 32, winner: false }] },
    { id: 'old', gameId: 'kart', modeId: null, playedAt: '2025-09-01T12:00:00Z', duration: 0, results: [] },
  ],
}
const empty: PlayFilters = { search: '', game: '', mode: '', month: '', year: '' }
const page = (values = data) => renderToStaticMarkup(createElement(PlayHistoryPage, { data: values, demo: true, onOpen: () => {}, onEdit: () => {}, onAdd: () => {} }))

describe('KingScore play history', () => {
  it('combines note, alias, game, mode and date filters and sorts newest first', () => {
    expect(filterPlays(data, empty).map(play => play.id)).toEqual(['new', 'old'])
    expect(filterPlays(data, { ...empty, search: 'rimonta', game: 'kart', mode: 'gp', month: '10', year: '2026' }).map(play => play.id)).toEqual(['new'])
    expect(filterPlays(data, { ...empty, search: 'kartqueen' })).toHaveLength(1)
    expect(filterPlays(data, { ...empty, month: '9', year: '2026' })).toHaveLength(0)
    expect(filterPlays(data, { ...empty, game: 'other' })).toHaveLength(0)
  })
  it('renders separate filters, date filters and the same card content as KingScore', () => {
    const html = page()
    for (const label of ['Filtri', 'Cerca gioco o note...', 'Filtra anno', 'Filtra mese', 'Aggiungi Partita', 'play-history-cover', 'KartQueen: 42', 'Bruno: 32', 'Una rimonta', 'Casa', '35 min', 'Modifica partita']) expect(html).toContain(label)
    for (const label of ['match-row-detailed', 'Modalità non specificata', '2–4 giocatori', 'Tutte le fonti']) expect(html).not.toContain(label)
    const visibleText = html.replace(/<[^>]*>/g, '')
    expect(visibleText).toContain('02/10/2026')
    expect(visibleText).not.toContain('12:00')
  })
  it('limits each page to 20 plays and provides the second page', () => {
    const html = page({ ...data, matches: Array.from({ length: 21 }, (_, i) => ({ ...data.matches[0], id: String(i) })) })
    expect(html.match(/class="play-history-card"/g)).toHaveLength(20)
    expect(html).toContain('Mostrando 1-20 di 21')
    expect(html).toContain('aria-label="Pagina 2"')
    expect(html).toContain('aria-label="Pagina successiva"')
  })
  it('shows tied winner names and comment count without inventing a mode', () => {
    const html = renderToStaticMarkup(createElement(PlayHistoryCard, { play: { ...data.matches[0], modeId: null, results: data.matches[0].results.map(result => ({ ...result, winner: true })) }, game: data.games[0], players: new Map(data.players.map(player => [player.id, player])), comments: 3, onOpen: () => {} }))
    expect(html).toContain('Pareggio')
    expect(html).toContain('KartQueen e Bruno')
    expect(html).toContain('aria-label="3 commenti"')
    expect(html).not.toContain('play-history-mode')
  })
})
