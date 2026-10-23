import { rankedMatchResults } from './game-rules'
import type { Game, Match } from './data'

export function localPlayDate(value: string | Date = new Date()) {
  const date = new Date(value)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** An edit keeps the original time, including seconds, unless its date changes. */
export function playDateTime(date: string, initialPlay?: Match) {
  if (initialPlay && localPlayDate(initialPlay.playedAt) === date) return initialPlay.playedAt
  const value = initialPlay ? new Date(initialPlay.playedAt) : new Date(`${date}T12:00:00`)
  const [year, month, day] = date.split('-').map(Number)
  value.setFullYear(year, month - 1, day)
  return value.toISOString()
}

export function initialWinners(play?: Match, game?: Game) {
  if (!play) return []
  return rankedMatchResults(play, game).filter(result => result.winner).map(result => result.playerId)
}
