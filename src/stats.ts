import { rankedMatchResults } from './game-rules'
import type { Game, Match, Player } from './data'

export type RankedPlayer = Player & { wins: number; games: number; points: number }

export function calculateLeaderboard(players: Player[], matches: Match[], games: Game[] = []): RankedPlayer[] {
  const totals = new Map(players.map((player) => [player.id, { wins: 0, games: 0, points: 0 }]))
  for (const match of matches) {
    if (!match.results.length) continue
    const winners = match.cooperative ? (match.teamWon ? match.results : []) : rankedMatchResults(match, games.find(game => game.id === match.gameId)).filter(result => result.winner)
    for (const result of match.results) {
      const row = totals.get(result.playerId)
      if (row) {
        row.games += 1
        row.points += result.score
      }
    }
    winners.forEach(({ playerId }) => { const winner = totals.get(playerId); if (winner) winner.wins += 1 })
  }
  return players
    .map((player) => ({ ...player, ...(totals.get(player.id) ?? { wins: 0, games: 0, points: 0 }) }))
    .sort((a, b) => b.wins - a.wins || b.points - a.points || a.name.localeCompare(b.name))
}
