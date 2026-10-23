import { modeKey } from '../game-modes.js'
import { simulateAllPlays, type SimulationPlay } from './simulation.js'

export type ModeSimulationPlay = SimulationPlay & { mode_id?: string | null }

/** Reuses the tested ELO formulas with independent state per (game, mode).
 * Aggregate game/general ratings continue to use the original simulation.
 */
export function simulateModePlays(plays: ModeSimulationPlay[]) {
  return simulateAllPlays(plays.map(play => ({ ...play, game_id: modeKey(play.game_id, play.mode_id) })))
}
