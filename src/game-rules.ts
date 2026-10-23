import type { Game, Match, Result } from './data.js'
import { assignPositions } from './elo/positions.js'

export const MIN_PLAYERS = 2

/** Mode IDs are user-defined, so Golf is identified by its displayed name. */
export function lowerScoreWins(gameName = '', modeName = '') {
  return /\bgolf\b/i.test(gameName) || /\bgolf\b/i.test(modeName)
}

export function matchLowerScoreWins(game: Game | undefined, modeId?: string | null) {
  return lowerScoreWins(game?.name, game?.modes?.find(mode => mode.id === modeId)?.name)
}

export function resolveWinners(results: Result[], lowScore = false) {
  const best = lowScore ? Math.min(...results.map(result => result.score)) : Math.max(...results.map(result => result.score))
  return results.map(result => ({ ...result, winner: result.winner ?? result.score === best }))
}

export function rankedMatchResults(match: Match, game?: Game) {
  const lowScore = matchLowerScoreWins(game, match.modeId)
  return assignPositions(resolveWinners(match.results, lowScore), { lowerScoreWins: lowScore })
}
