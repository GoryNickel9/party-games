import { rankedMatchResults } from './game-rules'
import type { Game, Match, Player } from './data'
import { simulateKingElo } from './kingscore-elo'

export type GameStatistic = {
  game: Game
  matches: number
  appearances: number
  wins: number
  winRate: number
  averageScore: number
  averageDuration: number
}

export type PlayerStatistic = {
  player: Player
  matches: number
  wins: number
  winRate: number
  points: number
  averageScore: number
}

export type MonthStatistic = { key: string; label: string; matches: number; minutes: number }
export type RatingPoint = { match: number; label: string; values: Record<string, number> }

export type PartyAnalytics = {
  totalMatches: number
  totalMinutes: number
  gameCount: number
  averagePlayers: number
  gameHIndex: number
  activeStreakDays: number
  months: MonthStatistic[]
  games: GameStatistic[]
  players: PlayerStatistic[]
  currentMonthGames: { game: Game; matches: number }[]
  currentMonthPlayers: PlayerStatistic[]
  quarterGames: { game: Game; matches: number }[]
  eloHistory: RatingPoint[]
  eloPlayers: Player[]
  activity: { date: string; count: number }[]
}

const monthNames = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic']
const localKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
const winnersForMatch = (match: Match, game?: Game) => match.cooperative
  ? (match.teamWon ? match.results : [])
  : rankedMatchResults(match, game).filter(result => result.winner)

export function calculatePartyAnalytics(players: Player[], games: Game[], matches: Match[], now = new Date()): PartyAnalytics {
  const playerMap = new Map(players.map((player) => [player.id, player]))
  const gameMap = new Map(games.map((game) => [game.id, game]))
  const perGame = new Map<string, { matches: number; appearances: number; wins: number; score: number; duration: number }>()
  const perPlayer = new Map(players.map((player) => [player.id, { matches: 0, wins: 0, points: 0 }]))
  const monthly = new Map<string, MonthStatistic>()
  const daily = new Map<string, number>()
  const orderedMatches = [...matches].sort((a, b) => Date.parse(a.playedAt) - Date.parse(b.playedAt))

  for (const match of orderedMatches) {
    const playedAt = new Date(match.playedAt)
    const monthKey = localKey(playedAt)
    const month = monthly.get(monthKey) ?? { key: monthKey, label: monthNames[playedAt.getMonth()], matches: 0, minutes: 0 }
    month.matches += 1
    month.minutes += match.duration
    monthly.set(monthKey, month)
    const dayKey = `${playedAt.getFullYear()}-${String(playedAt.getMonth() + 1).padStart(2, '0')}-${String(playedAt.getDate()).padStart(2, '0')}`
    daily.set(dayKey, (daily.get(dayKey) ?? 0) + 1)

    const game = perGame.get(match.gameId) ?? { matches: 0, appearances: 0, wins: 0, score: 0, duration: 0 }
    game.matches += 1
    game.duration += match.duration
    if (match.results.length > 0) {
      const winners = winnersForMatch(match, gameMap.get(match.gameId))
      for (const result of match.results) {
        game.appearances += 1
        game.score += result.score
        const playerStats = perPlayer.get(result.playerId)
        if (playerStats) {
          playerStats.matches += 1
          playerStats.points += result.score
        }
      }
      game.wins += winners.length
      winners.forEach(({ playerId }) => { const winner = perPlayer.get(playerId); if (winner) winner.wins += 1 })
    }
    perGame.set(match.gameId, game)
  }

  const gameStats: GameStatistic[] = [...perGame.entries()]
    .flatMap(([gameId, totals]) => {
      const game = gameMap.get(gameId)
      if (!game) return []
      return [{
        game,
        ...totals,
        winRate: totals.appearances ? Math.round((totals.wins / totals.appearances) * 100) : 0,
        averageScore: totals.appearances ? totals.score / totals.appearances : 0,
        averageDuration: totals.matches ? totals.duration / totals.matches : 0,
      }]
    })
    .sort((a, b) => b.matches - a.matches || a.game.name.localeCompare(b.game.name))

  const playerStats: PlayerStatistic[] = [...perPlayer.entries()]
    .flatMap(([playerId, totals]) => {
      const player = playerMap.get(playerId)
      if (!player) return []
      return [{
        player,
        ...totals,
        winRate: totals.matches ? Math.round((totals.wins / totals.matches) * 100) : 0,
        averageScore: totals.matches ? totals.points / totals.matches : 0,
      }]
    })
    .sort((a, b) => b.wins - a.wins || b.winRate - a.winRate || b.points - a.points)

  const startMonth = new Date(now.getFullYear(), now.getMonth() - 11, 1)
  const months: MonthStatistic[] = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(startMonth.getFullYear(), startMonth.getMonth() + index, 1)
    const key = localKey(date)
    return monthly.get(key) ?? { key, label: monthNames[date.getMonth()], matches: 0, minutes: 0 }
  })

  const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const activityStart = new Date(endDate)
  activityStart.setDate(activityStart.getDate() - 83)
  const activity = Array.from({ length: 84 }, (_, index) => {
    const date = new Date(activityStart)
    date.setDate(activityStart.getDate() + index)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    return { date: key, count: daily.get(key) ?? 0 }
  })

  const activeToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayKey = `${activeToday.getFullYear()}-${String(activeToday.getMonth() + 1).padStart(2, '0')}-${String(activeToday.getDate()).padStart(2, '0')}`
  if (!daily.has(todayKey)) activeToday.setDate(activeToday.getDate() - 1)
  let activeStreakDays = 0
  for (let offset = 0; offset < 3650; offset += 1) {
    const dayKey = `${activeToday.getFullYear()}-${String(activeToday.getMonth() + 1).padStart(2, '0')}-${String(activeToday.getDate()).padStart(2, '0')}`
    if (!daily.has(dayKey)) break
    activeStreakDays += 1
    activeToday.setDate(activeToday.getDate() - 1)
  }

  const monthKey = localKey(now)
  const monthMatches = orderedMatches.filter((match) => localKey(new Date(match.playedAt)) === monthKey)
  const monthGameCounts = new Map<string, number>()
  const monthPlayerTotals = new Map(players.map((player) => [player.id, { matches: 0, wins: 0, points: 0 }]))
  for (const match of monthMatches) {
    monthGameCounts.set(match.gameId, (monthGameCounts.get(match.gameId) ?? 0) + 1)
    const winners = winnersForMatch(match, gameMap.get(match.gameId))
    for (const result of match.results) {
      const totals = monthPlayerTotals.get(result.playerId)
      if (totals) {
        totals.matches += 1
        totals.points += result.score
      }
    }
    winners.forEach(({ playerId }) => { const winner = monthPlayerTotals.get(playerId); if (winner) winner.wins += 1 })
  }
  const monthPlayerStats = [...monthPlayerTotals.entries()].flatMap(([playerId, totals]) => {
    const player = playerMap.get(playerId)
    return player ? [{ player, ...totals, winRate: totals.matches ? Math.round((totals.wins / totals.matches) * 100) : 0, averageScore: totals.matches ? totals.points / totals.matches : 0 }] : []
  }).filter((stat) => stat.matches > 0).sort((a, b) => b.winRate - a.winRate || b.wins - a.wins)
  const quarterStart = new Date(now)
  quarterStart.setMonth(quarterStart.getMonth() - 3)
  const quarterCounts = new Map<string, number>()
  for (const match of orderedMatches) {
    if (new Date(match.playedAt) >= quarterStart) quarterCounts.set(match.gameId, (quarterCounts.get(match.gameId) ?? 0) + 1)
  }
  const gamesByCount = (counts: Map<string, number>) => [...counts.entries()].flatMap(([gameId, count]) => {
    const game = gameMap.get(gameId)
    return game ? [{ game, matches: count }] : []
  }).sort((a, b) => b.matches - a.matches || a.game.name.localeCompare(b.game.name))
  const rankedGameCounts = gameStats.map((game) => game.matches).sort((a, b) => b - a)
  let gameHIndex = 0
  rankedGameCounts.forEach((count, index) => { if (count >= index + 1) gameHIndex = index + 1 })

  const elo = simulateKingElo(players, orderedMatches, games)
  const eloHistory = elo.history
  const eloPlayers = [...players]
    .sort((a, b) => (elo.general[b.id]?.rating ?? 1000) - (elo.general[a.id]?.rating ?? 1000))
    .slice(0, 5)

  return {
    totalMatches: matches.length,
    totalMinutes: matches.reduce((sum, match) => sum + match.duration, 0),
    gameCount: new Set(matches.map((match) => match.gameId)).size,
    averagePlayers: matches.length ? matches.reduce((sum, match) => sum + match.results.length, 0) / matches.length : 0,
    gameHIndex,
    activeStreakDays,
    months,
    games: gameStats,
    players: playerStats,
    currentMonthGames: gamesByCount(monthGameCounts),
    currentMonthPlayers: monthPlayerStats,
    quarterGames: gamesByCount(quarterCounts),
    eloHistory,
    eloPlayers,
    activity,
  }
}
