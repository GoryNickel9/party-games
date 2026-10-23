import type { Game, Match, Player } from './data'
import { simulationInputs } from './king-elo-core'
import { simulateAllPlays } from './elo/simulation'
import { simulateModePlays } from './elo/mode-simulation'

export type PlayRating = { rating: number; ratingChange: number }

export function getPlayElo(players: Player[], matches: Match[], playId: string, games: Game[] = []) {
  const chronological = [...matches].sort((a, b) => Date.parse(a.playedAt) - Date.parse(b.playedAt) || a.id.localeCompare(b.id))
  const inputs = simulationInputs(players, chronological, games)
  const simulation = simulateAllPlays(inputs)
  const modeSimulation = simulateModePlays(inputs)
  const hasMode = !!matches.find(match => match.id === playId)?.modeId
  return {
    mode: Object.fromEntries(modeSimulation.gameHistory.filter(entry => entry.playId === playId && hasMode).map(entry => [entry.playerId, { rating: entry.rating, ratingChange: entry.ratingChange }])),
    game: Object.fromEntries(simulation.gameHistory.filter(entry => entry.playId === playId).map(entry => [entry.playerId, { rating: entry.rating, ratingChange: entry.ratingChange }])),
    general: Object.fromEntries(simulation.generalHistory.filter(entry => entry.playId === playId).map(entry => [entry.playerId, { rating: entry.rating, ratingChange: entry.ratingChange }])),
  }
}
