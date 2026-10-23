import type { Game, Match, Player } from './data'
import { simulateAllPlays, type GamePlayerState, type GeneralPlayerState } from './elo/simulation'
import { simulateModePlays } from './elo/mode-simulation'
import { matchLowerScoreWins, resolveWinners } from './game-rules'
import { modeKey } from './game-modes'
export type KingRating = { rating: number; games: number; wins: number; draws: number; losses: number }
export type KingHistoryPoint = { match: number; label: string; date: string; values: Record<string, number> }
export type KingEloResult = { perGame: Record<string, Record<string, KingRating>>; perMode: Record<string, Record<string, KingRating>>; general: Record<string, KingRating>; history: KingHistoryPoint[]; perGameHistory: Record<string, KingHistoryPoint[]>; perModeHistory: Record<string, KingHistoryPoint[]> }
const rating = (state: GamePlayerState | GeneralPlayerState): KingRating => ({ rating: state.rating, games: state.gamesPlayed, wins: state.wins, draws: state.draws, losses: state.losses })
/** Uses the shared simulation with the score direction of each game or mode. */
export function simulationInputs(players: Player[], matches: Match[], games: Game[] = []) {
  return matches.map(play => {
    const lowScore = matchLowerScoreWins(games.find(game => game.id === play.gameId), play.modeId)
    return {
      id: play.id, game_id: play.gameId, mode_id: play.modeId,
      lower_score_wins: lowScore, played_at: play.playedAt,
      play_scores: resolveWinners(play.results, lowScore).map(score => {
        const player = players.find(entry => entry.id === score.playerId)
        return { player_id: score.playerId, score: score.score, winner: score.winner, draw: score.draw ?? false, position: score.position ?? null, players: { name: player?.name ?? '?', alias: player?.alias ?? null } }
      }),
    }
  })
}

export function simulateKingElo(players: Player[], matches: Match[], games: Game[] = []): KingEloResult {
  const chronological = [...matches].sort((a, b) => Date.parse(a.playedAt) - Date.parse(b.playedAt) || a.id.localeCompare(b.id))
  const inputs = simulationInputs(players, chronological, games)
  const result = simulateAllPlays(inputs)
  const modeResult = simulateModePlays(inputs)
  const perModeHistory: KingEloResult['perModeHistory'] = {}
  const modeEntriesByPlay = new Map<string, typeof modeResult.gameHistory>()
  for (const entry of modeResult.gameHistory) modeEntriesByPlay.set(entry.playId, [...(modeEntriesByPlay.get(entry.playId) ?? []), entry])
  const values: Record<string, number> = {}
  const history: KingEloResult['history'] = []
  const entriesByPlay = new Map<string, typeof result.generalHistory>()
  for (const entry of result.generalHistory) entriesByPlay.set(entry.playId, [...(entriesByPlay.get(entry.playId) ?? []), entry])
  const gameEntriesByPlay = new Map<string, typeof result.gameHistory>()
  for (const entry of result.gameHistory) gameEntriesByPlay.set(entry.playId, [...(gameEntriesByPlay.get(entry.playId) ?? []), entry])
  const perGameHistory: KingEloResult['perGameHistory'] = {}
  for (const play of chronological) {
    const key = modeKey(play.gameId, play.modeId)
    const modeEntries = modeEntriesByPlay.get(play.id) ?? []
    if (modeEntries.length) {
      const points = perModeHistory[key] ?? []
      const modeValues = { ...points.at(-1)?.values }
      for (const entry of modeEntries) modeValues[entry.playerId] = entry.rating
      points.push({ match: points.length + 1, label: new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short' }).format(new Date(play.playedAt)), date: play.playedAt, values: modeValues })
      perModeHistory[key] = points
    }
    for (const entry of entriesByPlay.get(play.id) ?? []) values[entry.playerId] = entry.rating
    history.push({ match: history.length + 1, label: new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short' }).format(new Date(play.playedAt)), date: play.playedAt, values: { ...values } })
    const gameEntries = gameEntriesByPlay.get(play.id) ?? []
    if (gameEntries.length) {
      const gameHistory = perGameHistory[play.gameId] ?? []
      // Carry ratings forward only after a player's first appearance, as in KingScore.
      const gameValues = { ...gameHistory.at(-1)?.values }
      for (const entry of gameEntries) gameValues[entry.playerId] = entry.rating
      gameHistory.push({ match: gameHistory.length + 1, label: history.at(-1)!.label, date: play.playedAt, values: gameValues })
      perGameHistory[play.gameId] = gameHistory
    }
  }
  return { perGame: Object.fromEntries(Object.entries(result.gamePlayers).map(([id, entries]) => [id, Object.fromEntries(Object.entries(entries).map(([playerId, state]) => [playerId, rating(state)]))])), perMode: Object.fromEntries(Object.entries(modeResult.gamePlayers).map(([id, entries]) => [id, Object.fromEntries(Object.entries(entries).map(([playerId, state]) => [playerId, rating(state)]))])), general: Object.fromEntries(Object.entries(result.generalPlayers).map(([id, state]) => [id, rating(state)])), history, perGameHistory, perModeHistory }
}
