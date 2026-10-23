import { useEffect, useState } from 'react'
import { Calendar, ChevronLeft, ChevronRight, Clock, Edit, Filter, Gamepad2, MapPin, MessageCircle, Search, StickyNote, Trophy } from 'lucide-react'
import type { Game, Match, PartyData, Player } from './data'
import { GameImage } from './game-image'
import { rankedMatchResults } from './game-rules'
import { modeLabel } from './game-modes'
import { api } from './client'

const PLAYS_PER_PAGE = 20
const months = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre']
export type PlayFilters = { search: string; game: string; mode: string; month: string; year: string }
const emptyFilters: PlayFilters = { search: '', game: '', mode: '', month: '', year: '' }
const playerName = (player?: Player) => player?.alias || player?.name || 'Sconosciuto'

export function filterPlays(data: PartyData, filters: PlayFilters) {
  const games = new Map(data.games.map(game => [game.id, game]))
  const players = new Map(data.players.map(player => [player.id, player]))
  const search = filters.search.trim().toLocaleLowerCase('it-IT')
  return data.matches.filter(play => {
    const date = new Date(play.playedAt)
    const text = [games.get(play.gameId)?.name, play.notes, modeLabel(games.get(play.gameId), play.modeId), ...play.results.flatMap(result => [players.get(result.playerId)?.name, players.get(result.playerId)?.alias])].join(' ').toLocaleLowerCase('it-IT')
    return (!search || text.includes(search)) && (!filters.game || play.gameId === filters.game)
      && (!filters.mode || play.modeId === filters.mode)
      && (!filters.month || date.getMonth() + 1 === Number(filters.month))
      && (!filters.year || date.getFullYear() === Number(filters.year))
  }).sort((a, b) => Date.parse(b.playedAt) - Date.parse(a.playedAt) || a.id.localeCompare(b.id))
}

function pageNumbers(current: number, total: number): (number | string)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  if (current <= 3) return [1, 2, 3, 4, '...', total]
  if (current >= total - 2) return [1, '...', total - 3, total - 2, total - 1, total]
  return [1, '...', current - 1, current, current + 1, '...', total]
}

function Pagination({ current, total, onChange }: { current: number; total: number; onChange: (page: number) => void }) {
  if (total <= 1) return null
  return <nav className="play-history-pagination" aria-label="Paginazione partite">
    <button aria-label="Pagina precedente" disabled={current === 1} onClick={() => onChange(current - 1)}><ChevronLeft size={20} /></button>
    {pageNumbers(current, total).map((page, index) => typeof page === 'string' ? <span key={`ellipsis-${index}`}>...</span> : <button key={page} aria-label={`Pagina ${page}`} aria-current={page === current ? 'page' : undefined} onClick={() => onChange(page)}>{page}</button>)}
    <button aria-label="Pagina successiva" disabled={current === total} onClick={() => onChange(current + 1)}><ChevronRight size={20} /></button>
  </nav>
}

export function PlayHistoryCard({ play, game, players, comments = 0, onOpen, onEdit }: {
  play: Match; game?: Game; players: Map<string, Player>; comments?: number; onOpen: (id: string) => void; onEdit?: (id: string) => void;
}) {
  const scores = rankedMatchResults(play, game)
  const winners = scores.filter(result => result.winner).map(result => playerName(players.get(result.playerId)))
  const winnerNames = winners.length < 2 ? winners[0] : `${winners.slice(0, -1).join(', ')} e ${winners.at(-1)}`
  const mode = modeLabel(game, play.modeId)
  return <article className="play-history-card">
    <a className="play-history-open" href={`/plays/${encodeURIComponent(play.id)}`} onClick={event => { event.preventDefault(); onOpen(play.id) }}>
      <span className="play-history-cover"><GameImage game={game} fallback={<Gamepad2 size={40} color="#64748b" />} /></span>
      <div className="play-history-info">
        <div className="play-history-title"><h3>{game?.name ?? 'Gioco sconosciuto'}</h3>{comments > 0 && <span className="play-history-comments" aria-label={`${comments} ${comments === 1 ? 'commento' : 'commenti'}`}><MessageCircle size={14} />{comments}</span>}</div>
        <div className="play-history-meta"><span><Calendar size={16} /><time dateTime={play.playedAt}>{new Date(play.playedAt).toLocaleDateString('it-IT')}</time></span>{play.location && <span><MapPin size={16} />{play.location}</span>}{!!play.duration && <span><Clock size={16} />{play.duration} min</span>}</div>
        <div className="play-history-scores">{scores.slice(0, 4).map(result => <span key={result.playerId} className={result.winner ? 'winner' : ''}>{result.winner && <Trophy size={12} />}{playerName(players.get(result.playerId))}: {result.score}</span>)}{scores.length > 4 && <small>+{scores.length - 4} altri</small>}</div>
        {play.notes && <div className="play-history-notes"><StickyNote size={16} /><span>{play.notes}</span></div>}
      </div>
      {winners.length > 0 && <div className={`play-history-winner ${winners.length > 1 ? 'tie' : ''}`}>{winners.length > 1 ? <><small><Trophy size={12} />Pareggio</small><span>{winnerNames}</span></> : <span><Trophy size={16} />{winnerNames}</span>}</div>}
    </a>
    {(mode || onEdit) && <footer>{mode && <span className="play-history-mode">{mode}</span>}{onEdit && <button className="button button-secondary" onClick={() => onEdit(play.id)} aria-label="Modifica partita"><Edit size={16} />Modifica</button>}</footer>}
  </article>
}

export function PlayHistoryPage({ data, demo, onOpen, onEdit, onAdd }: { data: PartyData; demo: boolean; onOpen: (id: string) => void; onEdit?: (id: string) => void; onAdd?: () => void }) {
  const [filters, setFilters] = useState<PlayFilters>(emptyFilters)
  const [page, setPage] = useState(1)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const filtered = filterPlays(data, filters)
  const totalPages = Math.max(1, Math.ceil(filtered.length / PLAYS_PER_PAGE))
  const currentPage = Math.min(page, totalPages)
  const plays = filtered.slice((currentPage - 1) * PLAYS_PER_PAGE, currentPage * PLAYS_PER_PAGE)
  const idsKey = plays.map(play => play.id).join(',')
  const games = data.games.filter(game => data.matches.some(play => play.gameId === game.id))
  const selectedGame = data.games.find(game => game.id === filters.game)
  const years = [...new Set(data.matches.map(play => new Date(play.playedAt).getFullYear()))].sort((a, b) => b - a)
  const players = new Map(data.players.map(player => [player.id, player]))
  function changeFilters(values: Partial<PlayFilters>) { setFilters(current => ({ ...current, ...values })); setPage(1) }

  useEffect(() => {
    let active = true
    setCounts({})
    if (!idsKey) return
    if (demo) {
      const demoCounts = Object.fromEntries(idsKey.split(',').map(id => {
        try { const comments = JSON.parse(localStorage.getItem(`partyscore.comments.${id}`) ?? '[]'); return [id, Array.isArray(comments) ? comments.length : 0] } catch { return [id, 0] }
      }))
      setCounts(demoCounts)
    } else {
      void api<{ counts: Record<string, number> }>(`/api/comments?playIds=${encodeURIComponent(idsKey)}`).then(result => { if (active) setCounts(result.counts) }).catch(error => console.warn('Could not load play comment counts', error))
    }
    return () => { active = false }
  }, [idsKey, demo])

  return <div className="play-history-page">
    <header className="play-history-heading"><div><h1>Storico Partite</h1><p>{filtered.length} {filtered.length === 1 ? 'partita registrata' : 'partite registrate'}</p></div>{onAdd && <button className="button button-primary" onClick={onAdd}><Gamepad2 size={20} />Aggiungi Partita</button>}</header>
    <section className="play-history-filters"><h2><Filter size={20} />Filtri</h2><div className={`play-history-filter-grid ${selectedGame?.modes?.length ? 'has-modes' : ''}`}>
      <label className="play-history-search"><Search size={16} /><input aria-label="Cerca partite" placeholder="Cerca gioco o note..." value={filters.search} onChange={event => changeFilters({ search: event.target.value })} /></label>
      <select aria-label="Filtra gioco" value={filters.game} onChange={event => changeFilters({ game: event.target.value, mode: '' })}><option value="">Tutti i giochi</option>{games.map(game => <option key={game.id} value={game.id}>{game.name}</option>)}</select>
      {!!selectedGame?.modes?.length && <select aria-label="Filtra modalità" value={filters.mode} onChange={event => changeFilters({ mode: event.target.value })}><option value="">Tutte le modalità</option>{selectedGame.modes.map(mode => <option key={mode.id} value={mode.id}>{mode.name}{mode.active ? '' : ' (archiviata)'}</option>)}</select>}
      <div className="play-history-date-filters"><select aria-label="Filtra anno" value={filters.year} onChange={event => changeFilters({ year: event.target.value })}><option value="">Anno</option>{years.map(year => <option key={year} value={year}>{year}</option>)}</select><select aria-label="Filtra mese" value={filters.month} onChange={event => changeFilters({ month: event.target.value })}><option value="">Mese</option>{months.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}</select></div>
    </div>{Object.values(filters).some(Boolean) && <button className="play-history-clear" onClick={() => { setFilters(emptyFilters); setPage(1) }}>Rimuovi filtri</button>}</section>
    {filtered.length === 0 ? <section className="play-history-empty"><Gamepad2 size={64} /><h3>Nessuna partita trovata</h3><p>{data.matches.length ? 'Prova a cambiare i filtri' : onAdd ? 'Inizia aggiungendo la tua prima partita!' : 'Non ci sono partite da mostrare.'}</p>{!data.matches.length && onAdd && <button className="button button-primary" onClick={onAdd}><Gamepad2 size={20} />Aggiungi Prima Partita</button>}</section> : <div className="play-history-list">
      <p className="play-history-page-info">Pagina {currentPage} di {totalPages} — Mostrando {(currentPage - 1) * PLAYS_PER_PAGE + 1}-{Math.min(currentPage * PLAYS_PER_PAGE, filtered.length)} di {filtered.length}</p>
      {plays.map(play => <PlayHistoryCard key={play.id} play={play} game={data.games.find(game => game.id === play.gameId)} players={players} comments={counts[play.id]} onOpen={onOpen} onEdit={onEdit} />)}
      <Pagination current={currentPage} total={totalPages} onChange={setPage} />
    </div>}
  </div>
}
