import { GameImage } from './game-image'
import { PlayerAvatar } from './player-avatar'
import { BarChart3, Clock3, Gamepad2, Medal } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Game } from './data'
import type { PartyAnalytics } from './analytics'

const currentMonthKey = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

// Match SVG coordinates to CSS pixels so resizing never shrinks axis labels.
function useChartWidth() {
  const [element, setElement] = useState<SVGSVGElement | null>(null)
  const [width, setWidth] = useState(760)
  useEffect(() => {
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setWidth(entry.contentRect.width)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [element])
  return { ref: setElement, width }
}

export function Metric({ label, value, note, icon }: { label: string; value: string; note: string; icon: React.ReactNode }) {
  return <article className="insight-metric"><div className="insight-metric-top"><span>{label}</span><i>{icon}</i></div><strong>{value}</strong><small>{note}</small></article>
}

export function PanelTitle({ eyebrow, title, icon }: { eyebrow?: string; title: string; icon?: React.ReactNode }) {
  return <header className="panel-header analytics-panel-title"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2>{icon}{title}</h2></div></header>
}

function MonthlyLineChart({ analytics }: { analytics: PartyAnalytics }) {
  const { ref, width } = useChartWidth()
  const max = Math.max(1, ...analytics.months.map((month) => month.matches))
  const xFor = (index: number) => 34 + (index / Math.max(analytics.months.length - 1, 1)) * Math.max(1, width - 56)
  const yFor = (matches: number) => 142 - (matches / max) * 112
  const points = analytics.months.map((month, index) => `${xFor(index)},${yFor(month.matches)}`).join(' ')
  return <svg ref={ref} className="month-line-chart" viewBox={`0 0 ${width} 178`} role="img" aria-label="Partite registrate per mese negli ultimi dodici mesi">
    {[0, 1, 2, 3].map((tick) => { const value = Math.round((max / 3) * tick); const y = yFor(value); return <g key={tick}><line x1="34" x2={width - 12} y1={y} y2={y} /><text x="0" y={y + 4}>{value}</text></g> })}
    <polyline points={points} />
    {analytics.months.map((month, index) => <g key={month.key}><circle cx={xFor(index)} cy={yFor(month.matches)} r="3" /><title>{month.label}: {month.matches} partite</title>{index % (width < 420 ? 3 : 2) === 0 || index === analytics.months.length - 1 ? <text className="month-line-x" x={xFor(index)} y="170">{month.label}</text> : null}</g>)}
  </svg>
}

function DashboardInsights({ analytics, onShowStats }: { analytics: PartyAnalytics; onShowStats: () => void }) {
  const month = analytics.months.find((item) => item.key === currentMonthKey())
  const recentHours = [...analytics.months].filter((item) => item.minutes > 0).sort((a, b) => b.minutes - a.minutes).slice(0, 3)
  const gameList = (rows: { game: Game; matches: number }[]) => <div className="analytics-list compact">{rows.slice(0, 3).map((item, index) => <div className="analytics-list-row" key={item.game.id}><span className="analytics-index">{index + 1}</span><span className="game-mini-icon" style={{ '--game-accent': item.game.accent } as React.CSSProperties}><GameImage game={item.game} /></span><span className="analytics-list-name"><b>{item.game.name}</b><small>{item.game.platform}</small></span><strong>{item.matches}<small> partite</small></strong></div>)}</div>
  return <>
    <section className="analytics-grid dashboard-analytics">
      <div className="panel analytics-panel monthly-panel"><PanelTitle eyebrow="ULTIMI 12 MESI" title="Partite per mese" icon={<BarChart3 />} /><MonthlyLineChart analytics={analytics} /><button className="analytics-link" onClick={onShowStats}>Apri tutte le statistiche <span>↗</span></button></div>
      <div className="panel analytics-panel"><PanelTitle title="Giochi Preferiti (Top 3)" icon={<Gamepad2 />} />{gameList(analytics.games)}</div>
      <div className="panel analytics-panel"><PanelTitle title="Giochi del mese" icon={<CalendarDaysIcon />} />{month?.matches ? <>{gameList(analytics.currentMonthGames)}<div className="analytics-subrow"><span>Partite questo mese</span><b>{month.matches}</b></div></> : <div className="analytics-empty">Nessuna partita registrata questo mese.</div>}</div>
      <div className="panel analytics-panel"><PanelTitle title="Vittorie del mese" icon={<Medal />} />{analytics.currentMonthPlayers.length ? <div className="analytics-list compact">{analytics.currentMonthPlayers.slice(0, 3).map((item, index) => <div className="analytics-list-row" key={item.player.id}><span className="analytics-index">{index + 1}</span><PlayerAvatar player={item.player} className="dashboard-player-avatar" /><span className="analytics-list-name"><b>{item.player.name}</b><small>{item.matches} partite · {item.wins} vittorie</small></span><strong>{item.winRate}<small>%</small></strong></div>)}</div> : <div className="analytics-empty">Nessun risultato questo mese.</div>}</div>
      <div className="panel analytics-panel"><PanelTitle title="Giochi Preferiti Ultimi 3 Mesi (Top 3)" icon={<Gamepad2 />} />{gameList(analytics.quarterGames)}</div>
      <div className="panel analytics-panel"><PanelTitle title="Ore Giocate per Mese (Top 3)" icon={<Clock3 />} />{recentHours.length ? <div className="analytics-list compact">{recentHours.map((item, index) => <div className="analytics-list-row" key={item.key}><span className="analytics-index">{index + 1}</span><span className="analytics-list-name"><b>{item.label} {item.key.slice(0, 4)}</b><small>{item.matches} partite</small></span><strong>{(item.minutes / 60).toFixed(1)}<small> h</small></strong></div>)}</div> : <div className="analytics-empty">Aggiungi durata alle partite registrate.</div>}</div>
    </section>
  </>
}

function CalendarDaysIcon() { return <span className="calendar-icon">▦</span> }

export function DashboardAnalytics({ analytics, onShowStats }: { analytics: PartyAnalytics; onShowStats: () => void }) {
  return <DashboardInsights analytics={analytics} onShowStats={onShowStats} />
}
