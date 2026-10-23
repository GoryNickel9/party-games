import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Gamepad2, Star, TrendingUp } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Game, Match, Player } from './data'
import { filterModeMatches, modeKey } from './game-modes'
import { simulateKingElo } from './kingscore-elo'
import type { KingHistoryPoint } from './king-elo-core'

const fallbackColors = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1']
const displayName = (player: Player) => player.alias || player.name
const average = (total: number, count: number) => count ? Number((total / count).toFixed(2)) : 0

function RatingHistoryChart({ history, players, general = false }: { history: KingHistoryPoint[]; players: Player[]; general?: boolean }) {
  const ids = [...new Set(history.flatMap(point => Object.keys(point.values)))]
  const playerMap = new Map(players.map(player => [player.id, player]))
  const chartData = history.map(point => ({ match: point.match, ratings: point.values }))

  if (!ids.length) return <div className="statistics-chart-empty">
    {general ? <Star size={48} /> : <TrendingUp size={48} />}
    <p>Nessun dato {general ? 'ELO Generale' : 'ELO'} disponibile</p>
    <small>Gioca qualche partita per vedere l’evoluzione {general ? 'dell’ELO Generale' : 'degli ELO'}</small>
  </div>

  return <div className="statistics-chart" role="region" aria-label={general ? 'Andamento ELO Generale' : 'Evoluzione ELO del gioco'}>
    <ResponsiveContainer width="100%" height={260} minWidth={0}>
      <LineChart data={chartData} margin={{ top: 12, right: 12, bottom: 14, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
        <XAxis dataKey="match" stroke="#94a3b8" tick={{ fontSize: 14 }} allowDecimals={false} minTickGap={24} height={40}
          label={{ value: 'Partita', position: 'insideBottomRight', offset: -6, fill: '#94a3b8', fontSize: 14 }} />
        <YAxis stroke="#94a3b8" tick={{ fontSize: 14 }} domain={['auto', 'auto']} width={58} />
        <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: 8 }}
          itemStyle={{ color: '#e2e8f0' }} labelStyle={{ color: '#94a3b8' }} labelFormatter={value => `Partita ${value}`} />
        {ids.map((id, index) => <Line key={id} type="monotone" dataKey={point => point.ratings[id] ?? null}
          name={playerMap.has(id) ? displayName(playerMap.get(id)!) : 'Giocatore'}
          stroke={playerMap.get(id)?.color || fallbackColors[index % fallbackColors.length]} strokeWidth={2}
          connectNulls dot={{ r: 3 }} activeDot={{ r: 5 }} isAnimationActive={false} />)}
      </LineChart>
    </ResponsiveContainer>
    <div className="statistics-chart-legend">{ids.map((id, index) => <span key={id}>
      <i style={{ backgroundColor: playerMap.get(id)?.color || fallbackColors[index % fallbackColors.length] }} />
      {playerMap.has(id) ? displayName(playerMap.get(id)!) : 'Giocatore'}
    </span>)}</div>
  </div>
}

function GameThumbnail({ game }: { game: Game }) {
  const [failedSource, setFailedSource] = useState<string | null>(null)
  return <div className="statistics-game-cover">{game.imageUrl && failedSource !== game.imageUrl
    ? <img src={game.imageUrl} alt={game.name} loading="lazy" onError={() => setFailedSource(game.imageUrl!)} />
    : <Gamepad2 size={32} aria-hidden="true" />}</div>
}

export function StatisticsPage({ players, games, matches }: { players: Player[]; games: Game[]; matches: Match[] }) {
  const [modeFilters, setModeFilters] = useState<Record<string, string>>({})
  const [expandedGames, setExpandedGames] = useState<Record<string, boolean>>({})
  const elo = useMemo(() => simulateKingElo(players, matches, games), [players, matches, games])
  const gameStats = useMemo(() => {
    const playerMap = new Map(players.map(player => [player.id, player]))
    const playsByGame = new Map<string, Match[]>()
    for (const play of matches) {
      const gamePlays = playsByGame.get(play.gameId) ?? []
      gamePlays.push(play)
      playsByGame.set(play.gameId, gamePlays)
    }
    return games.flatMap(game => {
      const gamePlays = playsByGame.get(game.id)
      if (!gamePlays?.length) return []
      const modeFilter = modeFilters[game.id] ?? 'all'
      const plays = filterModeMatches(gamePlays, game.id, modeFilter)
      const playerScores = new Map<string, { total: number; count: number }>()
      let totalScore = 0, scoreCount = 0, duration = 0
      for (const play of plays) {
        duration += play.duration
        for (const result of play.results) {
          totalScore += result.score
          scoreCount += 1
          const scores = playerScores.get(result.playerId) ?? { total: 0, count: 0 }
          scores.total += result.score
          scores.count += 1
          playerScores.set(result.playerId, scores)
        }
      }
      const playerStats = [...playerScores].flatMap(([id, scores]) => {
        const player = playerMap.get(id)
        return player ? [{ player, count: scores.count, averageScore: average(scores.total, scores.count) }] : []
      }).sort((a, b) => b.averageScore - a.averageScore || displayName(a.player).localeCompare(displayName(b.player)))
      // Game average weights every individual score; duration weights each play once.
      return [{ game, totalPlays: plays.length, averageScore: average(totalScore, scoreCount), averageDuration: plays.length ? Math.round(duration / plays.length) : 0, players: playerStats }]
    }).sort((a, b) => b.totalPlays - a.totalPlays || a.game.name.localeCompare(b.game.name))
  }, [games, players, matches, modeFilters])

  return <div className="king-statistics-page">
    <header className="king-heading"><div><h1>Statistiche</h1><p>Analisi dettagliata delle partite</p></div></header>
    <section className="panel king-panel statistics-panel">
      <h2><Star className="statistics-general-icon" /> ELO Generale</h2>
      <RatingHistoryChart history={elo.history} players={players} general />
    </section>
    <section className="panel king-panel statistics-panel">
      <h2><Gamepad2 className="statistics-games-icon" /> Statistiche per Gioco</h2>
      {gameStats.length ? <div className="statistics-game-list">{gameStats.map(stat => {
        const expanded = !!expandedGames[stat.game.id]
        const detailsId = `statistics-game-${stat.game.id}`
        return <article className="statistics-game" key={stat.game.id}>
          <div className="statistics-game-summary">
            <div className="statistics-game-name"><GameThumbnail game={stat.game} /><div><h3>{stat.game.name}</h3><p>{stat.totalPlays} {stat.totalPlays === 1 ? 'partita totale' : 'partite totali'}</p></div></div>
            <div className="statistics-game-controls">
              <div className="statistics-game-average"><span>Punteggio medio</span><strong>{stat.averageScore}</strong></div>
              <div className="statistics-game-duration"><span>Durata media</span><strong>{stat.averageDuration} min</strong></div>
              <button className="button button-secondary" aria-expanded={expanded} aria-controls={detailsId}
                aria-label={`Statistiche giocatori: ${stat.game.name}`} onClick={() => setExpandedGames(current => ({ ...current, [stat.game.id]: !current[stat.game.id] }))}>
                Statistiche giocatori {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            </div>
          </div>
          {!!stat.game.modes?.length && <label className="field-label statistics-mode-filter">Modalità<select aria-label={`Modalità statistiche: ${stat.game.name}`} value={modeFilters[stat.game.id] ?? "all"} onChange={event => setModeFilters(current => ({ ...current, [stat.game.id]: event.target.value }))}><option value="all">Tutte le modalità</option>{stat.game.modes?.map(mode => <option key={mode.id} value={mode.id}>{mode.name}{mode.active ? "" : " (archiviata)"}</option>)}</select></label>}{expanded && <div className="statistics-game-details" id={detailsId}>
            <div><h4>Punteggio medio per giocatore</h4><div className="statistics-player-grid">{stat.players.map(({ player, count, averageScore }) => <article className="statistics-player" key={player.id}>
              {player.avatar_url ? <img src={player.avatar_url} alt="" /> : <span className="statistics-player-avatar" style={{ backgroundColor: player.color }}>{displayName(player).charAt(0).toUpperCase()}</span>}
              <div className="statistics-player-name"><b>{displayName(player)}</b><small>{count} {count === 1 ? 'partita' : 'partite'}</small></div>
              <div className="statistics-player-average"><strong>{averageScore}</strong><small>media</small></div>
            </article>)}</div></div>
            <div><h4>Evoluzione ELO nel tempo</h4><RatingHistoryChart history={(modeFilters[stat.game.id] && modeFilters[stat.game.id] !== "all" ? elo.perModeHistory[modeKey(stat.game.id, modeFilters[stat.game.id])] : elo.perGameHistory[stat.game.id]) ?? []} players={players} /></div>
          </div>}
        </article>
      })}</div> : <div className="king-empty"><Gamepad2 size={48} /><p>Nessuna statistica disponibile</p><small>Aggiungi delle partite per vedere le statistiche per gioco.</small></div>}
    </section>
  </div>
}
