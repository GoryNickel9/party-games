import type { PartyData } from '../../src/data.js'
import { rankedMatchResults } from '../../src/game-rules.js'
import { simulateKingElo } from '../../src/king-elo-core.js'
import { MOBILE_TIME_ZONE } from './mobile.js'

const dateFormat = new Intl.DateTimeFormat('en-CA', { timeZone: MOBILE_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
const dateKey = (date: string | Date) => {
  const parts = dateFormat.formatToParts(new Date(date))
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)!.value).join('-')
}
const months = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre']

/** Recap uses full-history ELO; filtering the simulation to the year resets ratings incorrectly. */
export function wrappedRecap(data: PartyData, year = Number(dateKey(new Date()).slice(0, 4)), playerId = '') {
  const yearOf = (date: string) => Number(dateKey(date).slice(0, 4))
  const plays = data.matches.filter(play => yearOf(play.playedAt) === year && (!playerId || play.results.some(result => result.playerId === playerId)))
    .sort((a, b) => Date.parse(a.playedAt) - Date.parse(b.playedAt) || a.id.localeCompare(b.id))
  const won = (play: typeof plays[number]) => play.cooperative ? !!play.teamWon : rankedMatchResults(play, data.games.find(game => game.id === play.gameId)).some(result => result.playerId === playerId && result.winner)
  const gameStats = data.games.map(game => {
    const items = plays.filter(play => play.gameId === game.id)
    return { id: game.id, name: game.name, matches: items.length, wins: playerId ? items.filter(won).length : 0 }
  }).filter(game => game.matches > 0).sort((a, b) => b.matches - a.matches || a.name.localeCompare(b.name, 'it'))
  const monthly = months.map((name, index) => {
    const items = plays.filter(play => Number(dateKey(play.playedAt).slice(5, 7)) === index + 1)
    return { name, matches: items.length, minutes: items.reduce((sum, play) => sum + play.duration, 0), games: new Set(items.map(play => play.gameId)).size }
  }).sort((a, b) => b.matches - a.matches)
  const days = new Map<string, number>()
  for (const play of plays) { const day = dateKey(play.playedAt); days.set(day, (days.get(day) ?? 0) + 1) }
  const busiest = [...days].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]
  const longest = [...plays].sort((a, b) => b.duration - a.duration)[0]
  const elo = simulateKingElo(data.players, data.matches, data.games)
  const before = elo.history.filter(point => yearOf(point.date) < year).at(-1)?.values ?? {}
  const end = elo.history.filter(point => yearOf(point.date) === year).at(-1)?.values ?? before
  const ids = [...new Set(plays.flatMap(play => play.results.map(result => result.playerId)))].filter(id => !playerId || id === playerId)
  return {
    year, playerId, years: [...new Set([Number(dateKey(new Date()).slice(0, 4)), ...data.matches.map(play => yearOf(play.playedAt))])].sort((a, b) => b - a),
    matches: plays.length, minutes: plays.reduce((sum, play) => sum + play.duration, 0), games: gameStats.length,
    topGame: gameStats[0] ?? null, topMonth: plays.length ? monthly[0] : null,
    wins: playerId ? plays.filter(won).length : null,
    bestGame: playerId ? [...gameStats].sort((a, b) => b.wins - a.wins).find(game => game.wins > 0) ?? null : null,
    longest: longest ? { name: data.games.find(game => game.id === longest.gameId)?.name ?? 'Gioco sconosciuto', minutes: longest.duration } : null,
    busiest: busiest ? { day: busiest[0], matches: busiest[1] } : null,
    ratings: ids.map(id => ({ id, name: data.players.find(player => player.id === id)?.alias || data.players.find(player => player.id === id)?.name || 'Giocatore', start: before[id] ?? 1000, end: end[id] ?? before[id] ?? 1000 }))
      .sort((a, b) => b.end - a.end || a.id.localeCompare(b.id)),
  }
}
