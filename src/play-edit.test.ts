import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AddPlayPage } from './add-play'
import { PlayDetailPage } from './play-detail'
import { MatchRow } from './App'
import { getPlayElo } from './play-elo'
import { initialWinners, localPlayDate, playDateTime } from './play-form'
import { normalizePlayCommentContent } from './play-comments-data'
import type { Game, Match, Player } from './data'

const players: Player[] = [{ id: 'a', name: 'Anna', alias: 'Campionessa', initials: 'AN', color: '#10b981' }, { id: 'b', name: 'Bruno', initials: 'BR', color: '#38bdf8' }]
const game: Game = { id: 'world', name: 'Mario Kart World', platform: 'Nintendo Switch 2', category: 'Corse', emoji: '🏁', accent: '#10b981', imageUrl: 'https://example.com/cover.png', modes: [{ id: 'grand', name: 'Gran Premio', active: true }, { id: 'old', name: 'Archiviata', active: false }] }
const match: Match = { id: 'play1', gameId: 'world', modeId: 'grand', playedAt: '2026-01-01T21:12:34.567Z', duration: 32, source: 'online', location: 'Casa', notes: 'Una serata', results: [{ playerId: 'a', score: 42, winner: true, position: 1 }, { playerId: 'b', score: 31, winner: false, position: 2 }] }
const form = (play: Match) => renderToStaticMarkup(createElement(AddPlayPage, { games: [game], players, initialPlay: play, onSave: async () => {}, onCancel: () => {}, onAddPlayer: () => {}, onGames: () => {} }))
const detail = (play: Match, admin = false) => renderToStaticMarkup(createElement(PlayDetailPage, { match: play, game, players, matches: [play], account: null, demo: true, onBack: () => {}, onDeleted: () => {}, onLogin: () => {}, ...(admin ? { onEdit: () => {}, onDelete: async () => true } : {}) }))

describe('editing and KingScore play detail', () => {
  it('prefills all play fields and participant scores', () => {
    const html = form(match)
    for (const text of ['Modifica Partita', 'Salva modifiche', 'value="32"', 'value="42"', 'value="31"', 'value="Casa"', 'Una serata', 'value="grand" selected=""']) expect(html).toContain(text)
    expect(html.match(/aria-label="Partita Cooperativa"[^>]*checked/)).toBeNull()
  })
  it('keeps the current archived mode available when editing', () => {
    expect(form({ ...match, modeId: 'old' })).toContain('value="old" selected="">Archiviata (archiviata)')
    expect(form({ ...match, modeId: null })).not.toContain('Modalità non specificata')
  })
  it('locks the game and removes search, new game, source and cooperative controls from edits', () => {
    const html = form(match)
    for (const text of ['aria-label="Gioco"', 'Cerca un gioco', 'Aggiungi Nuovo Gioco', 'name="source"', 'Partita Cooperativa', 'Esito cooperativo']) expect(html).not.toContain(text)
    expect(html).toContain('Mario Kart World')
    expect(html).toContain('aria-label="Modalità di gioco"')
  })
  it('shows an edit action directly on a match row for admins', () => {
    const props = { match: { ...match, modeId: null }, game, players: new Map(players.map(player => [player.id, player])), onOpen: () => {} }
    const adminRow = renderToStaticMarkup(createElement(MatchRow, { ...props, onEdit: () => {} }))
    expect(adminRow).toContain('aria-label="Modifica partita"')
    expect(adminRow).toContain('Modifica</button>')
    expect(adminRow).not.toContain('Modalità non specificata')
    expect(renderToStaticMarkup(createElement(MatchRow, props))).not.toContain('aria-label="Modifica partita"')
  })
  it('keeps the exact original timestamp on a score-only edit', () => {
    expect(playDateTime(localPlayDate(match.playedAt), match)).toBe(match.playedAt)
    const changed = new Date(playDateTime('2026-01-05', match)), original = new Date(match.playedAt)
    expect(localPlayDate(changed)).toBe('2026-01-05')
    expect([changed.getHours(), changed.getMinutes(), changed.getSeconds(), changed.getMilliseconds()]).toEqual([original.getHours(), original.getMinutes(), original.getSeconds(), original.getMilliseconds()])
  })
  it('preserves explicit winners rather than choosing the largest score', () => {
    expect(initialWinners({ ...match, results: [{ playerId: 'a', score: 42, winner: false }, { playerId: 'b', score: 31, winner: true }] })).toEqual(['b'])
    expect(initialWinners({ ...match, results: [{ playerId: 'a', score: 42 }, { playerId: 'b', score: 31 }] })).toEqual(['a'])
  })
  it('shows historical ELO at that match rather than the final rating', () => {
    const next = { ...match, id: 'play2', playedAt: '2026-01-03T12:00:00Z' }
    expect(getPlayElo(players, [next, match], match.id)).toMatchObject({ game: { a: { rating: 1024, ratingChange: 24 }, b: { rating: 976, ratingChange: -24 } }, general: { a: { rating: 1024, ratingChange: 24 } } })
    expect(getPlayElo(players, [match, next], next.id).game.a.rating).toBe(1045)
    const reversed = { ...match, results: [{ playerId: 'a', score: 0, winner: false }, { playerId: 'b', score: 1, winner: true }] }
    expect(getPlayElo(players, [reversed, next], match.id).game.a.rating).toBe(976)
  })
  it('renders the original KingScore card, notes, comments and three ELO columns for games with modes', () => {
    const html = detail(match, true)
    for (const label of ['Modifica', 'Elimina', 'class="play-cover"', 'Note', 'Commenti', 'Punteggi', 'Posizione', 'Giocatore', 'Punteggio', 'Vincitore', 'ELO Generale', '+24', '-24', 'Campionessa', '(Anna)', 'Gran Premio']) expect(html).toContain(label)
    expect(html).not.toContain('match-row')
    expect(html.match(/<th /g)).toBeNull()
    expect(html.match(/<th>/g)).toHaveLength(7)
  })
  it('hides admin controls for anonymous visitors', () => {
    const html = detail(match)
    expect(html).not.toContain('> Modifica</button>')
    expect(html).not.toContain('> Elimina</button>')
    expect(html).toContain('per lasciare un commento.')
  })
  it('shows equal placement and draw badges for tied winners', () => {
    const html = detail({ ...match, results: [{ playerId: 'a', score: 42, winner: true, position: 1 }, { playerId: 'b', score: 42, winner: true, position: 1 }] })
    expect(html.match(/position-1/g)).toHaveLength(2)
    expect(html.match(/>Pareggio</g)).toHaveLength(2)
  })
  it('hides absent modes and source badges from the detail', () => {
    const html = detail({ ...match, modeId: null })
    for (const text of ['Modalità non specificata', '>IRL<', '>Online<', 'Team ha vinto', 'Cooperativa', 'play-badges']) expect(html).not.toContain(text)
  })
  it('validates comment text and preserves plain text markup', () => {
    expect(normalizePlayCommentContent('  <script>test</script>\r\nlinea  ')).toBe('<script>test</script>\nlinea')
    for (const input of ['', '  ', null, 'x'.repeat(1001)]) expect(() => normalizePlayCommentContent(input)).toThrow()
  })
})
