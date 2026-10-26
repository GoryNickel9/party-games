import type { Game, Match, Player } from './data.js'
import { simulationInputs } from './king-elo-core.js'
import { simulateAllPlays } from './elo/simulation.js'
import { simulateModePlays } from './elo/mode-simulation.js'

export type PlayRating = { rating: number; ratingChange: number }
export type PlayElo = { mode: Record<string, PlayRating>; game: Record<string, PlayRating>; general: Record<string, PlayRating> }

/** Simulate the full history once, before filtering or paginating matches. */
export function getPlaysElo(players: Player[], matches: Match[], games: Game[] = []) {
  const chronological = [...matches].sort((a, b) => Date.parse(a.playedAt) - Date.parse(b.playedAt) || a.id.localeCompare(b.id))
  const inputs = simulationInputs(players, chronological, games)
  const simulation = simulateAllPlays(inputs)
  const modeSimulation = simulateModePlays(inputs)
  const ratings = new Map<string, PlayElo>(matches.map(match => [match.id, { mode: {}, game: {}, general: {} }]))
  const withMode = new Set(matches.filter(match => match.modeId).map(match => match.id))
  const histories = { mode: modeSimulation.gameHistory, game: simulation.gameHistory, general: simulation.generalHistory }
  for (const scope of ['mode', 'game', 'general'] as const) {
    for (const entry of histories[scope]) {
      if (scope === 'mode' && !withMode.has(entry.playId)) continue
      ratings.get(entry.playId)![scope][entry.playerId] = { rating: entry.rating, ratingChange: entry.ratingChange }
    }
  }
  return ratings
}

export function getPlayElo(players: Player[], matches: Match[], playId: string, games: Game[] = []): PlayElo {
  return getPlaysElo(players, matches, games).get(playId) ?? { mode: {}, game: {}, general: {} }
}
