import { validateModes } from './game-modes'
import { MIN_PLAYERS } from './game-rules'
import { useEffect, useState } from 'react'
import { Gamepad2, Plus, ShieldCheck, Trash2, X } from 'lucide-react'
import type { Game, PartyData, Player } from './data'
import { api, readImage, type Account } from './client'

type AdminData = { users: (Account & { created_at: string; last_login_at: string | null })[]; players: Player[]; summary: { plays: number; games: number; players: number; registrations: number }; registrationsOpen: boolean; lastRecalc: { status: string; processed_plays: number } | null }
const message = (error: unknown) => error instanceof Error ? error.message : 'Operazione non riuscita.'
function GameCover({ source, name }: { source?: string | null; name: string }) {
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const unavailable = !!source && failedSource === source
  return <div className="cover-image">
    {source && !unavailable
      ? <img key={source} src={source} alt={name} loading="lazy" decoding="async" onError={() => setFailedSource(source)} />
      : <div className="cover-placeholder"><Gamepad2 size={56} aria-hidden="true" /><span>{unavailable ? 'Copertina non disponibile' : 'Nessuna copertina'}</span></div>}
  </div>
}

function ImageField({ value, onChange, onError }: { value: string; onChange: (value: string) => void; onError: (value: string) => void }) {
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const unavailable = !!value && failedSource === value
  return <div className="image-field">
    {value && (unavailable
      ? <span className="image-preview-placeholder" aria-label="Anteprima non disponibile"><Gamepad2 aria-hidden="true" /></span>
      : <img key={value} src={value} alt="Anteprima immagine" onError={() => setFailedSource(value)} />)}
    <label className="field-label">URL Immagine (opzionale)<input type="url" value={value.startsWith('data:') ? '' : value} onChange={event => onChange(event.target.value)} placeholder="https://…" /></label>
    <p className="image-field-help">Usa il link diretto al file immagine, oppure carica un file JPEG, PNG o WebP dal computer (massimo 10 MB).</p>
    {unavailable && <p className="image-field-error" role="status">L’immagine non si carica. Controlla che il link apra un’immagine, non una pagina web, oppure carica il file dal computer.</p>}
    <label className="upload-control">Carica immagine<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { const file = event.target.files?.[0]; if (file) void readImage(file).then(onChange).catch(error => onError(message(error))) }} /></label>
    {value && <button type="button" className="text-link" onClick={() => onChange('')}>Rimuovi immagine</button>}
  </div>
}
export function GamesPage({ data, onUpdate, demo }: { data: PartyData; onUpdate: (data: PartyData) => void; demo: boolean }) {
  const [editing, setEditing] = useState<Partial<Game> | null>(null)
  const [search, setSearch] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!editing) return; setBusy(true); setError('')
    try {
      const values = { id: editing.id, name: editing.name, platform: editing.platform, category: editing.category, minPlayers: MIN_PLAYERS, maxPlayers: editing.maxPlayers, imageUrl: editing.imageUrl, modes: validateModes(editing.modes) }
      const game = demo ? { ...values, id: editing.id ?? crypto.randomUUID(), emoji: '🎮', accent: '#10b981' } as Game : await api<Game>('/api/games', { method: editing.id ? 'PATCH' : 'POST', body: JSON.stringify(values) })
      if (demo) {
        const removedIds = new Set(data.games.find(item => item.id === game.id)?.modes?.filter(mode => !game.modes?.some(item => item.id === mode.id)).map(mode => mode.id) ?? [])
        onUpdate({ ...data, games: [...data.games.filter(item => item.id !== game.id), game].sort((a, b) => a.name.localeCompare(b.name)), matches: data.matches.map(play => play.gameId === game.id && play.modeId && removedIds.has(play.modeId) ? { ...play, modeId: null } : play) })
      } else onUpdate(await api<PartyData>('/api/data'))
      setEditing(null)
    } catch (caught) { setError(message(caught)) } finally { setBusy(false) }
  }
  async function remove(game: Game) {
    if (data.matches.some(play => play.gameId === game.id)) { setError('Non puoi eliminare un gioco con partite registrate.'); return }
    if (!window.confirm(`Eliminare ${game.name}?`)) return
    try { if (!demo) await api(`/api/games?id=${encodeURIComponent(game.id)}`, { method: 'DELETE' }); onUpdate({ ...data, games: data.games.filter(item => item.id !== game.id) }) } catch (caught) { setError(message(caught)) }
  }
  return <><header className="king-heading"><div><h1>Libreria Giochi</h1><p>Gestisci i party game e le loro copertine.</p></div><button className="button button-primary" onClick={() => { setError(''); setEditing({ name: '', platform: 'Nintendo Switch', category: 'Party', minPlayers: MIN_PLAYERS, maxPlayers: 4, imageUrl: '', modes: [] }) }}><Plus size={18} /> Aggiungi Gioco</button></header>{error && <p className="form-error" role="alert">{error}</p>}<label className="search-box library-search"><input placeholder="Cerca giochi…" value={search} onChange={event => setSearch(event.target.value)} /></label><div className="king-library">{data.games.filter(game => game.name.toLowerCase().includes(search.toLowerCase())).map(game => <article className="panel library-card" key={game.id}><GameCover source={game.imageUrl} name={game.name} /><div className="library-card-body"><h3>{game.name}</h3><p>{game.platform}</p><small>{data.matches.filter(play => play.gameId === game.id).length} partite</small><p className="game-mode-summary">{game.modes?.filter(mode => mode.active).map(mode => mode.name).join(" · ")}</p><div className="management-actions"><button className="button button-secondary" onClick={() => setEditing({ ...game, modes: game.modes ?? [] })}>Modifica</button><button className="icon-button" onClick={() => void remove(game)} aria-label={`Elimina ${game.name}`}><Trash2 size={17} /></button></div></div></article>)}</div>
    {editing && <div className="modal-backdrop"><section className="modal-card"><header className="modal-head"><h2>{editing.id ? 'Modifica Gioco' : 'Aggiungi Nuovo Gioco'}</h2><button className="icon-button" onClick={() => setEditing(null)} aria-label="Chiudi"><X /></button></header><form onSubmit={save}><label className="field-label">Nome del gioco *<input required minLength={2} maxLength={160} value={editing.name} onChange={event => setEditing({ ...editing, name: event.target.value })} /></label><div className="form-row"><label className="field-label">Console *<input required maxLength={80} value={editing.platform} onChange={event => setEditing({ ...editing, platform: event.target.value })} /></label><label className="field-label">Categoria<input maxLength={80} value={editing.category} onChange={event => setEditing({ ...editing, category: event.target.value })} /></label></div><div className="form-row"><label className="field-label">Min. Giocatori<input type="number" readOnly value={MIN_PLAYERS} aria-describedby="minimum-players-help" /><small id="minimum-players-help">Il minimo è sempre 2 giocatori.</small></label><label className="field-label">Max. Giocatori<input type="number" min={MIN_PLAYERS} max={12} required value={editing.maxPlayers ?? 4} onChange={event => setEditing({ ...editing, maxPlayers: Number(event.target.value) })} /></label></div><fieldset className="game-modes-editor"><legend>Modalità di gioco</legend><p>Le modalità sono facoltative. Puoi eliminarle tutte. Le partite di una modalità eliminata restano registrate senza quel collegamento.</p>{editing.modes?.map((mode, index) => <div className="game-mode-editor-row" key={mode.id}><label className="field-label">Nome modalità {index + 1}<input required minLength={2} maxLength={80} value={mode.name} onChange={event => setEditing({ ...editing, modes: editing.modes?.map(item => item.id === mode.id ? { ...item, name: event.target.value } : item) })} /></label><label><input type="checkbox" checked={mode.active} onChange={event => setEditing({ ...editing, modes: editing.modes?.map(item => item.id === mode.id ? { ...item, active: event.target.checked } : item) })} /> Attiva</label>{<button type="button" className="icon-button" aria-label={`Elimina modalità ${mode.name || index + 1}`} onClick={() => setEditing({ ...editing, modes: editing.modes?.filter(item => item.id !== mode.id) })}><Trash2 size={16} /></button>}</div>)}<button type="button" className="text-link" disabled={(editing.modes?.length ?? 0) >= 30} onClick={() => setEditing({ ...editing, modes: [...(editing.modes ?? []), { id: crypto.randomUUID(), name: "", active: true }] })}>+ Aggiungi modalità</button></fieldset><ImageField value={editing.imageUrl ?? ''} onChange={imageUrl => setEditing({ ...editing, imageUrl })} onError={setError} />{error && <p className="form-error">{error}</p>}<footer className="modal-foot"><button type="button" className="button button-secondary" onClick={() => setEditing(null)}>Annulla</button><button className="button button-primary" disabled={busy}>{busy ? 'Salvataggio…' : editing.id ? 'Salva modifiche' : 'Aggiungi Gioco'}</button></footer></form></section></div>}</>
}
export function SettingsPage({ account, onUpdate, demo }: { account: Account; onUpdate: (user: Account) => void; demo: boolean }) {
  const [name, setName] = useState(account.display_name), [avatar, setAvatar] = useState(account.avatar_url ?? ''), [email, setEmail] = useState(account.email)
  const [currentPassword, setCurrentPassword] = useState(''), [password, setPassword] = useState(''), [confirm, setConfirm] = useState('')
  const [error, setError] = useState(''), [success, setSuccess] = useState(''), [busy, setBusy] = useState(false)
  async function save(event: React.FormEvent, action: string) {
    event.preventDefault(); setError(''); setSuccess('')
    if (action === 'password' && password !== confirm) { setError('Le password non coincidono.'); return }
    if (demo && action !== 'profile') { setError('Email e password si modificano con un account reale.'); return }
    setBusy(true)
    try {
      const result = demo ? { user: { ...account, display_name: name, avatar_url: avatar } } : await api<{ user: Account }>('/api/settings', { method: 'PATCH', body: JSON.stringify({ action, displayName: name, avatarUrl: avatar, email, currentPassword, newPassword: password }) })
      onUpdate(result.user); setPassword(''); setConfirm(''); setCurrentPassword(''); setSuccess('Impostazioni aggiornate.')
    } catch (caught) { setError(message(caught)) } finally { setBusy(false) }
  }
  return <div className="settings-page"><header className="king-heading"><div><h1>Impostazioni</h1><p>Gestisci l’immagine del profilo, l’email e la password del tuo account.</p></div></header>{error && <p className="form-error" role="alert">{error}</p>}{success && <p className="success-message" role="status">{success}</p>}<section className="panel king-panel"><h2>Immagine del profilo</h2><form onSubmit={event => void save(event, 'profile')}><label className="field-label">Nome<input required minLength={2} maxLength={32} value={name} onChange={event => setName(event.target.value)} /></label><ImageField value={avatar} onChange={setAvatar} onError={setError} /><button className="button button-primary" disabled={busy}>Salva profilo</button></form></section><section className="panel king-panel"><h2>Email</h2><p>Indirizzo attuale: {account.email}</p><form onSubmit={event => void save(event, 'email')} className="settings-form"><input type="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="Nuova email" /><input type="password" required autoComplete="current-password" placeholder="Password attuale" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} /><button className="button button-primary" disabled={busy}>Aggiorna email</button></form></section><section className="panel king-panel"><h2>Password</h2><p>Scegli una nuova password di almeno 10 caratteri.</p><form onSubmit={event => void save(event, 'password')} className="settings-form"><input type="password" autoComplete="current-password" required value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} placeholder="Password attuale" /><input type="password" autoComplete="new-password" required minLength={10} maxLength={200} value={password} onChange={event => setPassword(event.target.value)} placeholder="Nuova password" /><input type="password" autoComplete="new-password" required minLength={10} maxLength={200} value={confirm} onChange={event => setConfirm(event.target.value)} placeholder="Conferma password" /><button className="button button-primary" disabled={busy}>Aggiorna password</button></form></section></div>
}
export function AdminPage({ data, onUpdate, demo, onAddPlayer }: { data: PartyData; onUpdate: (data: PartyData) => void; demo: boolean; onAddPlayer: () => void }) {
  const [section, setSection] = useState('overview'), [dashboard, setDashboard] = useState<AdminData | null>(null), [search, setSearch] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  async function load() {
    if (demo) { setDashboard({ users: [], players: data.players, summary: { plays: data.matches.length, games: data.games.length, players: data.players.length, registrations: 0 }, registrationsOpen: true, lastRecalc: null }); return }
    try { setDashboard(await api<AdminData>('/api/admin')) } catch (caught) { setError(message(caught)) }
  }
  useEffect(() => { void load() }, [data.players])
  async function toggle() {
    if (!dashboard) return; setBusy(true); setError('')
    try { if (!demo) await api('/api/admin', { method: 'PATCH', body: JSON.stringify({ registrationsOpen: !dashboard.registrationsOpen }) }); setDashboard({ ...dashboard, registrationsOpen: !dashboard.registrationsOpen }) } catch (caught) { setError(message(caught)) } finally { setBusy(false) }
  }
  async function updatePlayer(player: Player, values: { name: string; alias: string; accountId: string }) {
    setError('')
    try {
      const updated = demo
        ? { ...player, name: values.name, alias: values.alias, account_user_id: values.accountId || null }
        : await api<Player>('/api/players', { method: 'PATCH', body: JSON.stringify({ id: player.id, color: player.color, avatarUrl: player.avatar_url, ...values }) })
      setDashboard(current => current ? { ...current, players: current.players.map(item => item.id === player.id ? updated : item) } : current)
      onUpdate({ ...data, players: data.players.map(item => item.id === player.id ? updated : item) })
    } catch (caught) { setError(message(caught)) }
  }
  async function remove(player: Player) {
    if (!window.confirm(`Eliminare il giocatore ${player.name}?`)) return
    if (data.matches.some(play => play.results.some(score => score.playerId === player.id))) { setError('Non puoi eliminare un player con partite registrate.'); return }
    try { if (!demo) await api(`/api/players?id=${player.id}`, { method: 'DELETE' }); onUpdate({ ...data, players: data.players.filter(item => item.id !== player.id) }) } catch (caught) { setError(message(caught)) }
  }
  return <><header className="king-heading"><div className="admin-title"><ShieldCheck size={36} /><div><small>PartyScore</small><h1>Pannello admin</h1><p>Gestisci player, account e registrazioni.</p></div></div><button className="button button-secondary" onClick={() => void load()}>Aggiorna</button></header>{error && <p className="form-error" role="alert">{error}</p>}{dashboard && <><div className="admin-summary">{[['Partite', dashboard.summary.plays], ['Giochi', dashboard.summary.games], ['Player', dashboard.summary.players], ['Account', dashboard.summary.registrations]].map(([label, value]) => <article className="panel king-panel" key={label}><p>{label}</p><strong>{value}</strong></article>)}</div><nav className="admin-tabs" aria-label="Sezioni amministrative">{[['overview', 'Panoramica'], ['players', 'Giocatori'], ['registrations', 'Registrazioni']].map(([id, label]) => <button key={id} role="tab" aria-selected={section === id} className={section === id ? 'selected' : ''} onClick={() => setSection(id)}>{label}</button>)}</nav>{section === 'overview' && <div className="admin-shortcuts">{[['players', 'Giocatori', 'Cerca e aggiorna i profili player registrati nell’app.'], ['registrations', 'Registrazioni', 'Consulta gli account e scegli se accettare nuove registrazioni.']].map(([id, title, description]) => <button key={id} className="panel king-panel" onClick={() => setSection(id)}><h2>{title}</h2><p>{description}</p></button>)}</div>}{section === 'players' && <section className="panel king-panel"><header className="king-heading"><h2>Gestione player</h2><button className="button button-primary" onClick={onAddPlayer}><Plus size={16} /> Aggiungi giocatore</button></header><input className="management-search" placeholder="Cerca nome o alias…" value={search} onChange={event => setSearch(event.target.value)} />{data.players.filter(player => `${player.name} ${player.alias ?? ''}`.toLowerCase().includes(search.toLowerCase())).map(player => <PlayerEditor key={JSON.stringify([player.id, player.name, player.alias, dashboard.players.find(profile => profile.id === player.id)?.account_user_id])} player={{ ...player, account_user_id: dashboard.players.find(profile => profile.id === player.id)?.account_user_id }} users={dashboard.users.filter(user => !dashboard.players.some(profile => profile.id !== player.id && profile.account_user_id === user.id))} onSave={values => updatePlayer(player, values)} onDelete={() => void remove(player)} />)}</section>}{section === 'registrations' && <section className="panel king-panel"><header className="king-heading"><div><h2>Registrazioni</h2><p>{dashboard.summary.registrations} account · Registrazioni {dashboard.registrationsOpen ? 'aperte' : 'chiuse'}</p></div><button className="button button-primary" disabled={busy} onClick={() => void toggle()}>{dashboard.registrationsOpen ? 'Chiudi registrazioni' : 'Apri registrazioni'}</button></header><div className="table-scroll"><table className="king-table"><thead><tr><th>Account</th><th>Registrazione</th><th>Email</th><th>Ultimo accesso</th><th>Ruolo</th></tr></thead><tbody>{dashboard.users.map(user => <tr key={user.id}><td>{user.display_name}</td><td>{new Date(user.created_at).toLocaleDateString('it-IT')}</td><td>{user.email}</td><td>{user.last_login_at ? new Date(user.last_login_at).toLocaleString('it-IT') : '—'}</td><td>{user.role}</td></tr>)}</tbody></table></div></section>}</>}</>
}
function PlayerEditor({ player, users, onSave, onDelete }: { player: Player; users: Account[]; onSave: (values: { name: string; alias: string; accountId: string }) => Promise<void>; onDelete: () => void }) {
  const [name, setName] = useState(player.name), [alias, setAlias] = useState(player.alias ?? ''), [accountId, setAccountId] = useState(player.account_user_id ?? '')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (accountId && !users.some(user => user.id === accountId)) setAccountId(player.account_user_id ?? '')
  }, [users, accountId, player.account_user_id])
  async function save(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    try { await onSave({ name, alias, accountId }) } finally { setSaving(false) }
  }
  return <form className="player-editor" onSubmit={event => void save(event)}><label className="field-label">Nome<input required minLength={2} maxLength={32} value={name} onChange={event => setName(event.target.value)} /></label><label className="field-label">Alias<input maxLength={32} value={alias} onChange={event => setAlias(event.target.value)} /></label><label className="field-label">Account collegato<select value={accountId} onChange={event => setAccountId(event.target.value)}><option value="">Nessun account</option>{users.map(user => <option key={user.id} value={user.id}>{user.display_name} · {user.email}</option>)}</select></label><button className="button button-primary" disabled={saving}>{saving ? 'Salvataggio…' : 'Salva'}</button><button type="button" className="icon-button" disabled={saving} onClick={onDelete} aria-label={`Elimina ${player.name}`}><Trash2 size={17} /></button></form>
}
