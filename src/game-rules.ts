import type { Game, GameMode, Match, Result } from './data.js'
import { assignPositions } from './elo/positions.js'

export const MIN_PLAYERS = 2

export function playSelectionError(modes: readonly GameMode[], modeId: string | null | undefined, results: readonly { winner?: unknown }[], retainedModeId?: string | null) {
  if (modes.length && !modeId) return 'Seleziona una modalità per questo gioco.'
  if (modeId && !modes.some(mode => mode.id === modeId && (mode.active || mode.id === retainedModeId))) return 'Seleziona una modalità disponibile.'
  if (!results.some(result => result.winner === true)) return 'Seleziona almeno un vincitore tra i giocatori della partita.'
  return ''
}

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
