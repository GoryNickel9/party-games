import { GameImage } from './game-image'
import { PlayerAvatar as Avatar } from './player-avatar'
import { PlayDetailPage } from './play-detail'
import { filterModeMatches, modeLabel } from './game-modes'
import { PlayHistoryPage } from './play-history'
import { useEffect, useMemo, useState } from 'react'
import { ArrowLeftRight, ArrowUpRight, BarChart3, CalendarDays, ChevronDown, Gamepad2, LayoutDashboard, LogOut, Medal, Plus, Settings, ShieldCheck, Sparkles, Swords, Trophy, Users, X, Trash2, Edit } from 'lucide-react'
import { gameCatalog, loadPartyData, makePlayer, savePartyData } from './data'
import type { Game, Match, PartyData, Player } from './data'
import { calculatePartyAnalytics } from './analytics'
import { DashboardAnalytics, Metric, PanelTitle } from './analytics-ui'
import { StatisticsPage } from './statistics-page'
import { api, type Account } from './client'
import { GamesPage, AdminPage, SettingsPage } from './management'
import { AddPlayPage } from './add-play'
import { EloPage, WrappedPage } from './public-recaps'
import { PlayersPage } from './players-page'
import { rankedMatchResults } from './game-rules'

type Page = 'login' | 'admin' | 'settings' | 'add-play' | 'edit-play' | 'overview' | 'matches' | 'games' | 'leaderboard' | 'statistics' | 'stats-2' | 'stats-3' | 'stats-4' | 'stats-5' | 'elo' | 'wrapped' | 'game-detail' | 'player-detail' | 'play-detail'
const pageFromPath = (): Page => {
  const path = window.location.pathname
  if (path === '/plays/new') return 'add-play'
  if (/^\/plays\/[^/]+\/edit$/.test(path)) return 'edit-play'
  if (/^\/games\/[^/]+$/.test(path)) return 'game-detail'
  if (/^\/players\/[^/]+$/.test(path)) return 'player-detail'
  if (/^\/plays\/[^/]+$/.test(path)) return 'play-detail'
  return ({ '/login': 'login', '/admin': 'admin', '/settings': 'settings', '/': 'overview', '/plays': 'matches', '/games': 'games', '/players': 'leaderboard', '/stats': 'statistics', '/stats/2': 'stats-2', '/stats/3': 'stats-3', '/stats/4': 'stats-4', '/stats/5-plus': 'stats-5', '/elo': 'elo', '/wrapped': 'wrapped' } as Record<string, Page>)[path] ?? 'overview'
}
const detailIdFromPath = () => { const parts = window.location.pathname.split('/'); return decodeURIComponent(parts.at(-1) === 'edit' ? parts.at(-2) ?? '' : parts.at(-1) ?? '') }
const pathForPage = (page: Page, detailId = '') => ({ login: '/login', admin: '/admin', settings: '/settings', 'add-play': '/plays/new', 'edit-play': `/plays/${encodeURIComponent(detailId)}/edit`, overview: '/', matches: '/plays', games: '/games', leaderboard: '/players', statistics: '/stats', 'stats-2': '/stats/2', 'stats-3': '/stats/3', 'stats-4': '/stats/4', 'stats-5': '/stats/5-plus', elo: '/elo', wrapped: '/wrapped', 'game-detail': `/games/${encodeURIComponent(detailId)}`, 'player-detail': `/players/${encodeURIComponent(detailId)}`, 'play-detail': `/plays/${encodeURIComponent(detailId)}` } as Record<Page, string>)[page]
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true'
const playDate = (value: string) => new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value))
const durationLabel = (n: number) => n === 0 ? '—' : n >= 60 ? `${Math.floor(n / 60)}h ${n % 60}m` : `${n} min`
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char)

function AuthScreen({ onDemo, onSignedIn }: { onDemo: () => void; onSignedIn: (user: Account) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setBusy(true)
    try {
      const result = await api<{ user: Account }>(`/api/auth/${mode === 'login' ? 'login' : 'register'}`, { method: 'POST', body: JSON.stringify({ displayName: name, email, password }) })
      onSignedIn(result.user)
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Riprova tra poco.') } finally { setBusy(false) }
  }
  return <main className="auth-page"><section className="auth-card"><div className="brand-mark large"><Gamepad2 size={24} /></div><p className="eyebrow">IL TUO TABELLONE</p><h1>Le serate<br /><span>hanno un punteggio.</span></h1><p className="auth-copy">Tieni il conto delle sfide, dei game e delle rivincite.</p><form onSubmit={submit} className="auth-form">
    {mode === 'register' && <label>Come ti chiami?<input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={32} required placeholder="Il tuo nome" /></label>}
    <label>Email<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="nome@email.it" /></label>
    <label>Password<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} minLength={mode === 'register' ? 10 : undefined} required placeholder={mode === 'register' ? 'Almeno 10 caratteri' : 'La tua password'} /></label>
    {error && <p className="form-error">{error}</p>}<button className="button button-primary full" disabled={busy}>{busy ? 'Un secondo…' : mode === 'login' ? 'Entra nella tua lobby' : 'Crea account'}<ArrowUpRight size={16} /></button></form>
    <p className="auth-switch">{mode === 'login' ? 'È la prima volta qui?' : 'Hai già un account?'} <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}>{mode === 'login' ? 'Crea un account' : 'Accedi'}</button></p>
    {DEMO_MODE && <button className="demo-entry" onClick={onDemo}>Dai un’occhiata alla demo <ArrowUpRight size={14} /></button>}<div className="auth-foot"><span className="status-dot" />{DEMO_MODE ? 'Anteprima locale attiva' : 'Statistiche pubbliche · Gestione riservata'}</div></section>
    <aside className="auth-art"><div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" /><div className="art-star">✳</div><div className="art-controller">🎮</div><div className="floating-score"><span>NUOVO RECORD</span><strong>1°</strong><small>Mario Kart · ieri sera</small></div><div className="art-caption"><b>GG, bella partita.</b><span>La prossima rivincita è già in programma.</span></div></aside></main>
}

function App() {
  const [page, setPage] = useState<Page>(pageFromPath)
  const [detailId, setDetailId] = useState(detailIdFromPath)
  const [account, setAccount] = useState<Account | null>(null)
  const [isDemo, setIsDemo] = useState(false)
  const [data, setData] = useState<PartyData>({ players: [], games: gameCatalog, matches: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modal, setModal] = useState<'player' | null>(null)
  const [playerName, setPlayerName] = useState('')
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)

  useEffect(() => {
    const onPopState = () => { setPage(pageFromPath()); setDetailId(detailIdFromPath()) }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])
  useEffect(() => {
    const destination = pathForPage(page, detailId)
    if (window.location.pathname !== destination) window.history.pushState({}, '', destination)
  }, [page, detailId])

  useEffect(() => {
    if (DEMO_MODE) {
      setData(loadPartyData()); setAccount({ id: 'demo', display_name: 'Demo', email: 'demo@partyscore.local', role: 'admin' }); setIsDemo(true); setLoading(false); return
    }
    let cancelled = false
    Promise.all([api<{ user: Account }>('/api/auth/me').catch(() => ({ user: null })), api<PartyData>('/api/data')])
      .then(([session, loaded]) => { if (!cancelled) { setAccount(session.user); setData(loaded) } })
      .catch(caught => { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Errore nel caricamento.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const gameById = useMemo(() => new Map(data.games.map((game) => [game.id, game])), [data.games])
  const playerById = useMemo(() => new Map(data.players.map((player) => [player.id, player])), [data.players])
  const sortedMatches = useMemo(() => [...data.matches].sort((a, b) => Date.parse(b.playedAt) - Date.parse(a.playedAt)), [data.matches])
  const analytics = useMemo(() => calculatePartyAnalytics(data.players, data.games, data.matches), [data])
  const mostPlayed = useMemo(() => {
    const counts = new Map<string, number>()
    data.matches.forEach((match) => counts.set(match.gameId, (counts.get(match.gameId) ?? 0) + 1))
    const [id, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? []
    return id ? { game: gameById.get(id), count } : null
  }, [data.matches, gameById])
  async function addMatch(match: Match, editing = false) {
    const results = rankedMatchResults(match, gameById.get(match.gameId))
    const winnerCount = results.filter(result => result.winner).length
    const normalized: Match = { ...match, source: 'offline', cooperative: false, teamWon: null, results: results.map(result => ({ ...result, draw: result.winner && winnerCount > 1 })) }
    if (isDemo) { const next = { ...data, matches: editing ? data.matches.map(play => play.id === normalized.id ? normalized : play) : [normalized, ...data.matches] }; savePartyData(next); setData(next); return }
    const saved = await api<{ id: string; eloUpdated: boolean }>('/api/matches', { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(normalized) })
    setData(await api<PartyData>('/api/data'))
    if (!saved.eloUpdated) setError('Partita salvata. La cache ELO non è stata aggiornata: usa Ricalcola Tutti gli ELO.')
  }
  async function removeMatch(id: string) {
    if (isDemo) { const next = { ...data, matches: data.matches.filter((match) => match.id !== id) }; savePartyData(next); setData(next); return true }
    try { const result = await api<{ eloUpdated: boolean }>(`/api/matches?id=${encodeURIComponent(id)}`, { method: 'DELETE' }); setData((current) => ({ ...current, matches: current.matches.filter((match) => match.id !== id) })); if (!result.eloUpdated) setError('Partita eliminata. Ricalcola la cache ELO dalla pagina Rating ELO.'); return true }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Non riesco a eliminare la partita.'); return false }
  }
  async function addPlayer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const name = playerName.trim(); if (name.length < 2) return
    if (isDemo) { const player = makePlayer(name, data.players.length); const next = { ...data, players: [...data.players, player] }; savePartyData(next); setData(next) }
    else {
      try { const player = await api<Player>('/api/players', { method: 'POST', body: JSON.stringify({ name }) }); setData((current) => ({ ...current, players: [...current.players, player] })) }
      catch (caught) { setError(caught instanceof Error ? caught.message : 'Non riesco ad aggiungere il giocatore.'); return }
    }
    setPlayerName(''); setModal(null)
  }
  function enterDemo() { setData(loadPartyData()); setAccount({ id: 'demo', display_name: 'Demo', email: 'demo@partyscore.local', role: 'admin' }); setIsDemo(true) }
  async function signOut() {
    if (!isDemo) await api('/api/auth/logout', { method: 'POST' }).catch(() => undefined)
    if (isDemo) setData(await api<PartyData>('/api/data').catch(() => ({ players: [], games: gameCatalog, matches: [] })))
    setAccount(null); setIsDemo(false); setPage('overview')
  }

  const admin = account?.role === 'admin'
  const restricted = ['games', 'leaderboard', 'admin', 'add-play', 'edit-play'].includes(page)
  const requiresLogin = restricted || page === 'settings' || page === 'player-detail'
  function updateData(next: PartyData) { setData(next); if (isDemo) savePartyData(next) }
  function newPlay() { setPage('add-play') }
  const bucketMatches = page.startsWith('stats-') ? data.matches.filter((match) => {
    const size = Number(page.slice(6))
    return size === 5 ? match.results.length >= 5 : match.results.length === size
  }) : data.matches

  return <div className="app-shell">
    <aside className="sidebar">
      <button className="brand" onClick={() => setPage('overview')}><span className="brand-mark"><Gamepad2 size={19} /></span><span>PartyScore</span></button>
      <nav className="side-nav" aria-label="Navigazione principale">
        <button className={page === 'overview' ? 'nav-active' : ''} onClick={() => setPage('overview')}><LayoutDashboard size={17} /><span>Dashboard</span></button>
        <button className={page === 'matches' ? 'nav-active' : ''} onClick={() => setPage('matches')}><CalendarDays size={17} /><span>Partite</span></button>
        <button className={page === 'statistics' ? 'nav-active' : ''} onClick={() => setPage('statistics')}><BarChart3 size={17} /><span>Statistiche</span></button>
        <button className={page === 'elo' ? 'nav-active' : ''} onClick={() => setPage('elo')}><Trophy size={17} /><span>Rating ELO</span></button>
        <button className={page === 'wrapped' ? 'nav-active' : ''} onClick={() => setPage('wrapped')}><Sparkles size={17} /><span>Wrapped</span></button>
        <a className="site-switch" href="https://kingscore.baldeddu.cc/" title="Vai a KingScore"><ArrowLeftRight size={17} /><span>KingScore</span></a>
      </nav>
      <div className="header-actions">{isDemo && <span className="demo-pill">DEMO</span>}{account ? <div className="profile-nav-group"><button className="header-account" onClick={() => setProfileMenuOpen(!profileMenuOpen)}>{account.avatar_url ? <img className="account-avatar" src={account.avatar_url} alt="" /> : <span className="avatar avatar-small">{account.display_name.slice(0,1)}</span>}<span>{account.display_name}</span><ChevronDown size={13} /></button>{profileMenuOpen && <div className="profile-nav-menu">{admin && <><button onClick={() => { setPage('games'); setProfileMenuOpen(false) }}><Gamepad2 size={15} /> Giochi</button><button onClick={() => { setPage('leaderboard'); setProfileMenuOpen(false) }}><Users size={15} /> Giocatori</button><button onClick={() => { setPage('admin'); setProfileMenuOpen(false) }}><ShieldCheck size={15} /> Pannello admin</button></>}<button onClick={() => { setPage('settings'); setProfileMenuOpen(false) }}><Settings size={15} /> Impostazioni</button><button onClick={() => { setProfileMenuOpen(false); void signOut() }}><LogOut size={15} /> Esci</button></div>}</div> : <button className="button button-primary" onClick={() => setPage('login')}>Accedi</button>}</div>
    </aside>
    <main className="main-content">{error && <div className="toast-error"><span>{error}</span><button onClick={() => setError('')} aria-label="Chiudi"><X size={15} /></button></div>}
      <div className="page-wrap">
        {loading ? <div className="king-empty">Caricamento…</div> : (page === 'login' || requiresLogin && !account) ? <AuthScreen onDemo={() => { enterDemo(); setPage('overview') }} onSignedIn={user => { setAccount(user); setPage(page === 'login' ? 'overview' : page) }} /> : restricted && !admin ? <section className="panel king-empty"><h1>Accesso riservato agli admin</h1><p>Il tuo account può consultare tutte le pagine pubbliche e usare Impostazioni.</p><button className="button button-primary" onClick={() => setPage('overview')}>Torna alla Dashboard</button></section> : <>
        {page === 'admin' && <AdminPage data={data} onUpdate={updateData} demo={isDemo} onAddPlayer={() => setModal('player')} />}
        {page === 'settings' && account && <SettingsPage account={account} onUpdate={user => { setAccount(user); if (!isDemo) void api<PartyData>('/api/data').then(setData).catch(() => undefined) }} demo={isDemo} />}
        {page === 'add-play' && <AddPlayPage games={data.games} players={data.players} onSave={play => addMatch(play)} onCancel={() => setPage('matches')} onAddPlayer={() => setModal('player')} onGames={() => setPage('games')} />}

        {page === 'edit-play' && (data.matches.some(play => play.id === detailId) ? <AddPlayPage key={detailId} initialPlay={data.matches.find(play => play.id === detailId)} games={data.games} players={data.players} onSave={play => addMatch(play, true)} onCancel={() => setPage("play-detail")} onAddPlayer={() => setModal("player")} onGames={() => setPage("games")} /> : <section className="panel king-panel"><h2>Partita non trovata</h2><button className="text-link" onClick={() => setPage("matches")}>Torna allo storico</button></section>)}
        {page === 'overview' && <>
          <section className="welcome-row"><div><h1>{account ? `Benvenuto, ${account.display_name}!` : 'Benvenuto!'}</h1><p>Ecco il riepilogo delle statistiche.</p></div><>{admin && <button className="button button-primary new-match" onClick={newPlay}><Plus size={17} /> Aggiungi partita</button>}</></section>
          <section className="stat-grid">
            <article className="stat-card stat-featured"><div className="stat-label">PARTITE TOTALI <span><Swords size={15} /></span></div><div className="stat-number">{data.matches.length}<small>partite</small></div></article>
            <article className="stat-card"><div className="stat-label">GIOCHI PREFERITI <span><Gamepad2 size={15} /></span></div><div className="favorite-game"><span className="game-mini-icon"><GameImage game={mostPlayed?.game} /></span><div><b>{mostPlayed?.game?.name ?? 'N/A'}</b><small>{mostPlayed ? `${mostPlayed.count} partite` : 'Nessun gioco registrato'}</small></div></div></article>
          </section>
          <DashboardAnalytics analytics={analytics} onShowStats={() => setPage('statistics')} />
          <section className="panel recent-panel kingscore-recent"><header className="panel-header"><div><h2>Ultime Partite</h2></div><button className="text-link" onClick={() => setPage('matches')}>Tutte le partite <ArrowUpRight size={14} /></button></header>
            {sortedMatches.length ? <div className="match-list">{sortedMatches.slice(0, 5).map((match) => <MatchRow key={match.id} match={match} game={gameById.get(match.gameId)} players={playerById} onOpen={() => { setDetailId(match.id); setPage('play-detail') }} />)}</div> : <EmptyState icon={<Gamepad2 />} title="Nessuna partita registrata" body="Aggiungi i tuoi party game e segna la prima sessione." action={admin ? 'Aggiungi partita' : undefined} onClick={newPlay} />}
          </section>        </>}
        {page === 'matches' && <PlayHistoryPage data={data} demo={isDemo} onOpen={id => { setDetailId(id); setPage('play-detail') }} onEdit={admin ? id => { setDetailId(id); setPage('edit-play') } : undefined} onAdd={admin ? newPlay : undefined} />}
        {page === 'games' && <GamesPage data={data} onUpdate={updateData} demo={isDemo} />}
        {page === 'leaderboard' && <PlayersPage data={data} demo={isDemo} onUpdate={updateData} onAdd={() => setModal('player')} onOpen={id => { setDetailId(id); setPage('player-detail') }} />}
        {page === 'game-detail' && <GameDetailPage key={detailId} game={data.games.find((game) => game.id === detailId)} matches={data.matches.filter((match) => match.gameId === detailId)} players={playerById} onEdit={admin ? id => { setDetailId(id); setPage('edit-play') } : undefined} onBack={() => setPage('matches')} />}
        {page === 'player-detail' && <PlayerDetailPage player={playerById.get(detailId)} matches={data.matches.filter((match) => match.results.some((result) => result.playerId === detailId))} games={gameById} players={playerById} elo={analytics} onEdit={admin ? id => { setDetailId(id); setPage('edit-play') } : undefined} onBack={() => setPage('leaderboard')} />}
        {page === 'play-detail' && <PlayDetailPage games={data.games} match={data.matches.find((match) => match.id === detailId)} game={gameById.get(data.matches.find((match) => match.id === detailId)?.gameId ?? '')} players={data.players} matches={data.matches} account={account} demo={isDemo} onBack={() => setPage("matches")} onEdit={admin ? () => setPage("edit-play") : undefined} onDelete={admin ? removeMatch : undefined} onDeleted={() => setPage("matches")} onLogin={() => setPage("login")} />}
        {(page === 'statistics' || page.startsWith('stats-')) && <StatisticsPage players={data.players} games={data.games} matches={bucketMatches} />}
        {page === 'elo' && <EloPage data={data} admin={admin} demo={isDemo} />}
        {page === 'wrapped' && <WrappedPage data={data} />}
        </>}
      </div>
    </main>
    {admin && modal === 'player' && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setModal(null) }}><section className="modal-card player-modal"><header className="modal-head"><div><span className="eyebrow">AGGIUNGI GIOCATORE</span><h2>Chi gioca stasera?</h2></div><button className="icon-button" onClick={() => setModal(null)} aria-label="Chiudi"><X size={18} /></button></header><form onSubmit={(e) => void addPlayer(e)}><label className="field-label">Nome player<input autoFocus minLength={2} maxLength={32} value={playerName} onChange={(e) => setPlayerName(e.target.value)} placeholder="Es. Vale" required /></label><div className="player-preview"><Avatar player={makePlayer(playerName || 'Player', data.players.length)} /><span>{playerName || 'Player'}</span><small>Un nuovo rivale è in lobby</small></div>{error && <p className="form-error">{error}</p>}<footer className="modal-foot"><button type="button" className="button button-quiet" onClick={() => setModal(null)}>Annulla</button><button className="button button-primary"><Plus size={15} /> Aggiungi</button></footer></form></section></div>}
  </div>
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action: React.ReactNode }) {
  return <section className="welcome-row page-heading"><div><div className="eyebrow">{eyebrow}</div><h1 dangerouslySetInnerHTML={{ __html: title }} />{description && <p>{description}</p>}</div>{action}</section>
}

function GameDetailPage({ game, matches: allMatches, players, onBack, onEdit }: { game?: Game; matches: Match[]; players: Map<string, Player>; onEdit?: (id: string) => void; onBack: () => void }) {
  const [selectedMode, setSelectedMode] = useState('all')
  const matches = game ? filterModeMatches(allMatches, game.id, selectedMode) : []
  if (!game) return <PageHeading eyebrow="LIBRERIA" title="Gioco <span>non trovato.</span>" description="Questo titolo non è nella libreria." action={<button className="button button-secondary" onClick={onBack}>Torna ai giochi</button>} />
  const scores = matches.flatMap((match) => match.results.map((result) => result.score))
  const duration = matches.reduce((sum, match) => sum + match.duration, 0)
  const playerRows = new Map<string, { sessions: number; wins: number; points: number }>()
  matches.forEach((match) => { rankedMatchResults(match, game).forEach((result) => { const row = playerRows.get(result.playerId) ?? { sessions: 0, wins: 0, points: 0 }; row.sessions += 1; row.points += result.score; if (result.winner) row.wins += 1; playerRows.set(result.playerId, row) }) })
  return <><PageHeading eyebrow={`${game.platform} · ${game.category}`} title={`${escapeHtml(game.name)}.`} action={<button className="button button-secondary" onClick={onBack}>← Tutti i giochi</button>} />{!!game.modes?.length && <section className="panel king-panel"><label className="field-label">Modalità<select aria-label="Modalità del gioco" value={selectedMode} onChange={event => setSelectedMode(event.target.value)}><option value="all">Tutte le modalità</option>{game.modes?.map(mode => <option key={mode.id} value={mode.id}>{mode.name}{mode.active ? "" : " (archiviata)"}</option>)}</select></label></section>}<section className="insight-metrics-grid"><Metric label="PARTITE" value={String(matches.length)} note="Sessioni registrate" icon={<Gamepad2 />} /><Metric label="PLAYER DIVERSI" value={String(playerRows.size)} note={game.platform} icon={<Users />} /><Metric label="DURATA MEDIA" value={`${matches.length ? Math.round(duration / matches.length) : 0} min`} note={`${Math.floor(duration / 60)} ore totali`} icon={<CalendarDays />} /><Metric label="PUNTEGGIO MEDIO" value={scores.length ? (scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(1) : '—'} note="Per partecipazione registrata" icon={<Trophy />} /></section><section className="analytics-grid"><div className="panel analytics-panel"><PanelTitle eyebrow="CLASSIFICA DEL GIOCO" title="Player più vincenti" icon={<Trophy />} />{[...playerRows.entries()].sort((a,b) => b[1].wins - a[1].wins || b[1].sessions - a[1].sessions).map(([id,row],index) => <div className="analytics-list-row" key={id}><span className="analytics-index">{index + 1}</span><Avatar player={players.get(id)} /><span className="analytics-list-name"><b>{players.get(id)?.name ?? 'Player'}</b><small>{row.sessions} partite · {row.points} punti</small></span><strong>{row.wins}<small> vittorie</small></strong></div>)}</div><div className="panel analytics-panel"><PanelTitle eyebrow="ULTIME SESSIONI" title="Storico del gioco" icon={<CalendarDays />} />{matches.length ? [...matches].sort((a,b) => Date.parse(b.playedAt)-Date.parse(a.playedAt)).slice(0,6).map((match) => <MatchRow key={match.id} match={match} game={game} players={players} onOpen={() => { window.history.pushState({}, '', `/plays/${match.id}`); window.dispatchEvent(new PopStateEvent('popstate')) }} onEdit={onEdit ? () => onEdit(match.id) : undefined} detailed />) : <div className="analytics-empty">Non ci sono ancora partite registrate con questo gioco.</div>}</div></section></>
}

function PlayerDetailPage({ player, matches, games, players, elo, onBack, onEdit }: { player?: Player; matches: Match[]; games: Map<string, Game>; players: Map<string, Player>; elo: ReturnType<typeof calculatePartyAnalytics>; onEdit?: (id: string) => void; onBack: () => void }) {
  if (!player) return <PageHeading eyebrow="GIOCATORI" title="Player <span>non trovato.</span>" description="Questo profilo non è disponibile." action={<button className="button button-secondary" onClick={onBack}>Torna ai giocatori</button>} />
  const wins = matches.reduce((sum, match) => { const result = rankedMatchResults(match, games.get(match.gameId)).find((item) => item.playerId === player.id); return sum + (result?.winner ? 1 : 0) }, 0)
  const points = matches.reduce((sum, match) => sum + (match.results.find((item) => item.playerId === player.id)?.score ?? 0), 0)
  const eloRating = elo.eloHistory.at(-1)?.values[player.id] ?? 1000
  const gameCounts = new Map<string, number>()
  matches.forEach((match) => gameCounts.set(match.gameId, (gameCounts.get(match.gameId) ?? 0) + 1))
  return <><PageHeading eyebrow="PROFILO PLAYER" title={`${escapeHtml(player.name)}.`} description="Risultati, giochi preferiti e storico delle partite del giocatore." action={<button className="button button-secondary" onClick={onBack}>← Tutti i giocatori</button>} /><section className="insight-metrics-grid"><Metric label="PARTITE" value={String(matches.length)} note="Presenze registrate" icon={<CalendarDays />} /><Metric label="VITTORIE" value={String(wins)} note={`${matches.length ? Math.round(wins / matches.length * 100) : 0}% win rate`} icon={<Trophy />} /><Metric label="ELO GENERALE" value={String(Math.round(eloRating))} note={`${elo.players.find((entry) => entry.player.id === player.id)?.matches ?? 0} partite conteggiate`} icon={<BarChart3 />} /><Metric label="PUNTI TOTALI" value={points.toLocaleString('it-IT')} note="Punteggio cumulativo" icon={<Medal />} /></section><section className="analytics-grid"><div className="panel analytics-panel"><PanelTitle eyebrow="PREFERENZE" title="Giochi più giocati" icon={<Gamepad2 />} />{[...gameCounts.entries()].sort((a,b) => b[1]-a[1]).map(([id,count],index) => { const game=games.get(id); return <div className="analytics-list-row" key={id}><span className="analytics-index">{index+1}</span><span className="game-mini-icon" style={{'--game-accent':game?.accent ?? '#475569'} as React.CSSProperties}>{game?.emoji ?? '🎮'}</span><span className="analytics-list-name"><b>{game?.name ?? 'Gioco'}</b><small>{game?.platform ?? 'Console'}</small></span><strong>{count}<small> partite</small></strong></div> })}</div><div className="panel analytics-panel"><PanelTitle eyebrow="ULTIME REGISTRAZIONI" title="Le sue partite" icon={<CalendarDays />} />{[...matches].sort((a,b) => Date.parse(b.playedAt)-Date.parse(a.playedAt)).slice(0,6).map((match) => <MatchRow key={match.id} match={match} game={games.get(match.gameId)} players={players} onOpen={() => { window.history.pushState({}, '', `/plays/${match.id}`); window.dispatchEvent(new PopStateEvent('popstate')) }} onEdit={onEdit ? () => onEdit(match.id) : undefined} detailed />)}</div></section></>
}

export function MatchRow({ match, game, players, onDelete, onEdit, onOpen, detailed = false }: { match: Match; game?: Game; players: Map<string, Player>; onDelete?: () => void; onEdit?: () => void; onOpen?: () => void; detailed?: boolean }) {
  const results = rankedMatchResults(match, game)
  const winners = results.filter(result => result.winner)
  const winner = winners[0], tied = winners.length > 1
  const label = modeLabel(game, match.modeId)
  return <article className={`match-row ${detailed ? 'match-row-detailed' : ''}`}>
    <div className="match-date"><b>{new Intl.DateTimeFormat('it-IT', { day: '2-digit' }).format(new Date(match.playedAt))}</b><span>{new Intl.DateTimeFormat('it-IT', { month: 'short' }).format(new Date(match.playedAt)).replace('.', '').toUpperCase()}</span></div>
    <div className="match-game-icon" style={{ '--game-accent': game?.accent ?? '#9387bb' } as React.CSSProperties}><GameImage game={game} /></div>
    <div className={`match-info ${onOpen ? 'match-info-open' : ''}`} onClick={onOpen} onKeyDown={event => { if (onOpen && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onOpen() } }} role={onOpen ? 'link' : undefined} tabIndex={onOpen ? 0 : undefined}>
      <b>{game?.name ?? 'Game rimosso'}</b><span>{game?.platform ?? 'Console'}{label && <> <i /> {label}</>} <i /> {durationLabel(match.duration)}{detailed && <> <i /> {playDate(match.playedAt)}</>}</span>
      <div className="match-participants">{results.map(result => <span key={result.playerId} className={!tied && result.playerId === winner?.playerId ? 'participant-winner' : ''}><Avatar player={players.get(result.playerId)} size="small" /><em>{players.get(result.playerId)?.name ?? 'Player'}</em><strong>{result.score}</strong></span>)}</div>
    </div>
    <div className="match-winner"><span>{tied ? 'PAREGGIO' : 'VINCITORE'}</span>{tied ? <b>—</b> : <b><Avatar player={players.get(winner?.playerId ?? '')} size="small" />{players.get(winner?.playerId ?? '')?.name ?? '—'}</b>}<small>{winner?.score ?? 0} pt</small></div>
    {(onEdit || onDelete) && <div className="match-actions">{onEdit && <button className="match-edit button button-secondary" onClick={onEdit} aria-label="Modifica partita"><Edit size={15} /> Modifica</button>}{onDelete && <button className="delete-match" onClick={onDelete} aria-label="Elimina partita"><Trash2 size={15} /></button>}</div>}
  </article>
}

function EmptyState({ icon, title, body, action, onClick }: { icon: React.ReactNode; title: string; body: string; action?: string; onClick?: () => void }) {
  return <div className="empty-state"><span className="empty-icon">{icon}</span><b>{title}</b><p>{body}</p>{action && onClick && <button className="button button-secondary" onClick={onClick}><Plus size={15} />{action}</button>}</div>
}

export default App
