import type { Game, Match, PartyData, Player } from '../../src/data.js'
import { rankedMatchResults } from '../../src/game-rules.js'
import { simulateKingElo, type KingRating } from '../../src/king-elo-core.js'
import { modeKey } from '../../src/game-modes.js'
import { getPlaysElo, type PlayElo } from '../../src/play-elo.js'

export const MOBILE_TIME_ZONE = 'Europe/Rome'
const dateParts = new Intl.DateTimeFormat('en-CA', { timeZone: MOBILE_TIME_ZONE, year: 'numeric', month: '2-digit' })
const monthNames = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic']
const monthKey = (value: string | Date) => {
  const parts = dateParts.formatToParts(new Date(value))
  return `${parts.find(p => p.type === 'year')!.value}-${parts.find(p => p.type === 'month')!.value}`
}
const playerView = (player?: Player) => ({ id: player?.id ?? '', name: player?.alias || player?.name || 'Giocatore', initials: player?.initials ?? '?', color: player?.color ?? '#475569', avatarUrl: player?.avatar_url ?? null })
const gameView = (game?: Game) => ({ id: game?.id ?? '', name: game?.name ?? 'Gioco sconosciuto', platform: game?.platform ?? '', imageUrl: game?.imageUrl ?? null, accent: game?.accent ?? '#10b981', modes: game?.modes ?? [] })

function matchView(data: PartyData, match: Match, elo: PlayElo | undefined) {
  const game = data.games.find(g => g.id === match.gameId)
  const ranked = rankedMatchResults(match, game)
  const results = ranked.map(result => ({ ...result, winner: match.cooperative ? !!match.teamWon : result.winner, player: playerView(data.players.find(p => p.id === result.playerId)), elo: {
    mode: elo?.mode[result.playerId] ?? null, game: elo?.game[result.playerId] ?? null, general: elo?.general[result.playerId] ?? null,
  } }))
  return { id: match.id, game: gameView(game), modeId: match.modeId ?? null, mode: game?.modes?.find(m => m.id === match.modeId)?.name ?? '', playedAt: match.playedAt, duration: match.duration, location: match.location ?? '', notes: match.notes ?? '', results }
}

export function catalog(data: PartyData) {
  return {
    games: data.games.map(game => ({ ...gameView(game), count: data.matches.filter(m => m.gameId === game.id).length }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'it')),
    years: [...new Set(data.matches.map(m => Number(monthKey(m.playedAt).slice(0, 4))))].sort((a, b) => b - a),
  }
}

export function dashboard(data: PartyData, now = new Date()) {
  const currentKey = monthKey(now)
  const [year, month] = currentKey.split('-').map(Number)
  const months = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 12 + index, 15))
    const key = monthKey(date)
    return { key, label: monthNames[date.getUTCMonth()], matches: data.matches.filter(m => monthKey(m.playedAt) === key).length }
  })
  const current = data.matches.filter(m => monthKey(m.playedAt) === currentKey)
  const victories = data.players.map(player => {
    const plays = current.filter(m => m.results.some(r => r.playerId === player.id))
    const wins = plays.filter(m => m.cooperative ? m.teamWon : rankedMatchResults(m, data.games.find(g => g.id === m.gameId)).some(r => r.playerId === player.id && r.winner)).length
    const points = plays.reduce((sum, m) => sum + (m.results.find(r => r.playerId === player.id)?.score ?? 0), 0)
    return { player: playerView(player), matches: plays.length, wins, winRate: plays.length ? Math.round(wins / plays.length * 100) : 0, points }
  }).filter(p => p.matches > 0).sort((a, b) => b.wins - a.wins || b.winRate - a.winRate || b.points - a.points || a.player.id.localeCompare(b.player.id))
  const metadata = catalog(data)
  const elo = getPlaysElo(data.players, data.matches, data.games)
  const modeCounts = new Map<string, { gameId: string; modeId: string | null; count: number }>()
  for (const match of data.matches) {
    const modeId = match.modeId || null
    const key = JSON.stringify([match.gameId, modeId])
    const entry = modeCounts.get(key) ?? { gameId: match.gameId, modeId, count: 0 }
    entry.count++
    modeCounts.set(key, entry)
  }
  const favoriteModes = [...modeCounts.values()].map(entry => {
    const game = data.games.find(game => game.id === entry.gameId)
    const mode = game?.modes?.find(mode => mode.id === entry.modeId)
    const modeName = mode ? mode.name + (mode.active ? '' : ' (archiviata)') : entry.modeId ? 'Modalità non disponibile' : 'Senza modalità'
    return { game: gameView(game), modeId: entry.modeId, modeName, count: entry.count }
  }).sort((a, b) => b.count - a.count || a.game.name.localeCompare(b.game.name, 'it') || a.modeName.localeCompare(b.modeName, 'it')
    || a.game.id.localeCompare(b.game.id) || (a.modeId ?? '').localeCompare(b.modeId ?? '')).slice(0, 3)
  return {
    totalMatches: data.matches.length, month: currentKey, timeZone: MOBILE_TIME_ZONE,
    months, favorites: metadata.games.filter(g => g.count > 0).slice(0, 3), favoriteModes,
    victories: victories.slice(0, 3),
    recent: [...data.matches].sort(compareMatches).slice(0, 5).map(m => matchView(data, m, elo.get(m.id))),
    ...metadata,
  }
}

export type MatchFilters = { search?: string; game?: string; mode?: string; year?: string; month?: string; page?: string }
const compareMatches = (a: Match, b: Match) => Date.parse(b.playedAt) - Date.parse(a.playedAt) || a.id.localeCompare(b.id)

export function matchesPage(data: PartyData, filters: MatchFilters) {
  const search = (filters.search ?? '').trim().toLocaleLowerCase('it-IT')
  const filtered = data.matches.filter(match => {
    const key = monthKey(match.playedAt)
    const game = data.games.find(g => g.id === match.gameId)
    const text = [game?.name, match.notes, game?.modes?.find(m => m.id === match.modeId)?.name,
      ...match.results.flatMap(r => { const p = data.players.find(p => p.id === r.playerId); return [p?.name, p?.alias] })].join(' ').toLocaleLowerCase('it-IT')
    return (!search || text.includes(search)) && (!filters.game || match.gameId === filters.game)
      && (!filters.mode || match.modeId === filters.mode) && (!filters.year || key.slice(0, 4) === filters.year)
      && (!filters.month || Number(key.slice(5)) === Number(filters.month))
  }).sort(compareMatches)
  const pageSize = 20, totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const page = Math.min(Number(filters.page ?? 1), totalPages)
  const elo = getPlaysElo(data.players, data.matches, data.games)
  return { page, pageSize, totalPages, total: filtered.length, items: filtered.slice((page - 1) * pageSize, page * pageSize).map(m => matchView(data, m, elo.get(m.id))) }
}

export function eloTable(data: PartyData, gameId = '', modeId = '') {
  const elo = simulateKingElo(data.players, data.matches, data.games)
  const ratings = gameId ? modeId ? elo.perMode[modeKey(gameId, modeId)] : elo.perGame[gameId] : elo.general
  const level = (value: number) => value >= 1500 ? 'Maestro' : value >= 1100 ? 'Esperto' : value >= 1050 ? 'Intermedio' : 'Principiante'
  return { gameId, modeId, rows: Object.entries(ratings ?? {}).sort((a, b) => b[1].rating - a[1].rating || a[0].localeCompare(b[0])).map(([id, rating]: [string, KingRating], index) => ({
    position: index + 1, player: playerView(data.players.find(p => p.id === id)), ...rating,
    winRate: Math.round(rating.wins / Math.max(1, rating.games) * 100), level: level(rating.rating),
  })) }
}
