import { initialWinners, localPlayDate, playDateTime } from './play-form'
import { MIN_PLAYERS, matchLowerScoreWins, playSelectionError } from './game-rules'
import { useState } from 'react'
import { Save, Search } from 'lucide-react'
import type { Game, Match, Player } from './data'

type PlayFormProps = {
  initialPlay?: Match
  games: Game[]
  players: Player[]
  onSave: (play: Match) => Promise<void>
  onCancel: () => void
  onAddPlayer: () => void
  onGames: () => void
}

export function AddPlayPage({ games, players, onSave, onCancel, onAddPlayer, onGames, initialPlay }: PlayFormProps) {
  const [modeId, setModeId] = useState(initialPlay?.modeId ?? '')
  const [gameId, setGameId] = useState(initialPlay?.gameId ?? '')
  const [search, setSearch] = useState('')
  const [date, setDate] = useState(() => localPlayDate(initialPlay?.playedAt ?? new Date()))
  const [location, setLocation] = useState(initialPlay?.location ?? '')
  const [duration, setDuration] = useState(initialPlay?.duration ? String(initialPlay.duration) : '')
  const [selected, setSelected] = useState<string[]>(initialPlay?.results.map(result => result.playerId) ?? [])
  const [scores, setScores] = useState<Record<string, string>>(Object.fromEntries(initialPlay?.results.map(result => [result.playerId, String(result.score)]) ?? []))
  const [winners, setWinners] = useState<string[]>(initialWinners(initialPlay, games.find(game => game.id === initialPlay?.gameId)))
  const [notes, setNotes] = useState(initialPlay?.notes ?? '')
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const game = games.find(item => item.id === gameId)
  const hasModes = !!game?.modes?.length
  const availableModes = game?.modes?.filter(mode => mode.active || initialPlay?.modeId === mode.id) ?? []

  async function save(event: React.FormEvent) {
    event.preventDefault(); setError('')
    if (!gameId) { setError('Seleziona un gioco.'); return }
    if (selected.length < MIN_PLAYERS) { setError('Seleziona almeno 2 giocatori.'); return }
    const results = selected.map(playerId => ({ playerId, score: Number(scores[playerId] || 0), winner: winners.includes(playerId) }))
    const selectionError = playSelectionError(game?.modes ?? [], modeId, results, initialPlay?.modeId)
    if (selectionError) { setError(selectionError); return }
    setBusy(true)
    try {
      await onSave({
        id: initialPlay?.id ?? crypto.randomUUID(), gameId, modeId: modeId || null,
        playedAt: playDateTime(date, initialPlay), duration: Number(duration), location, notes,
        source: 'offline', cooperative: false, teamWon: null,
        results,
      })
      onCancel()
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Salvataggio non riuscito.') }
    finally { setBusy(false) }
  }

  return <div className="add-play-page">
    <header className="king-heading"><div><h1>{initialPlay ? 'Modifica Partita' : 'Aggiungi Nuova Partita'}</h1><p>{initialPlay ? 'Aggiorna i dettagli della partita' : 'Registra i dettagli della tua partita'}</p></div></header>
    <form onSubmit={save} className="add-play-form">
      <section className="panel king-panel">
        <label className="field-label">Gioco{!initialPlay && ' *'}</label>
        {!initialPlay && <>
          <label className="search-box"><Search size={17} /><input placeholder="Cerca un gioco…" value={search} onChange={event => setSearch(event.target.value)} /></label>
          <select aria-label="Gioco" value={gameId} onChange={event => { setGameId(event.target.value); setModeId('') }} required>
            <option value="">Seleziona un gioco</option>{games.filter(item => item.name.toLowerCase().includes(search.toLowerCase())).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </>}
        {game && <div className="play-game-selected">{game.imageUrl ? <img src={game.imageUrl} alt={game.name} /> : <span>🎮</span>}<div><h3>{game.name}</h3><p>{game.platform}</p></div></div>}
        {hasModes && <label className="field-label">Modalità *<select aria-label="Modalità di gioco" required value={modeId} onChange={event => setModeId(event.target.value)}>
          <option value="" disabled>Seleziona una modalità</option>{availableModes.map(mode => <option key={mode.id} value={mode.id}>{mode.name}{mode.active ? '' : ' (archiviata)'}</option>)}
        </select></label>}
        {hasModes && !availableModes.length && <p className="form-error">Nessuna modalità disponibile. Attivane una nella gestione giochi prima di salvare.</p>}
        {!initialPlay && <button className="text-link" type="button" onClick={onGames}>+ Aggiungi Nuovo Gioco</button>}
      </section>
      <div className="play-meta-grid">
        <section className="panel king-panel"><label className="field-label">Data *<input type="date" required value={date} onChange={event => setDate(event.target.value)} /></label></section>
        <section className="panel king-panel"><label className="field-label">Luogo<input maxLength={120} value={location} onChange={event => setLocation(event.target.value)} placeholder="es. Casa mia" /></label></section>
        <section className="panel king-panel"><label className="field-label">Durata (minuti)<input type="number" min={1} max={1440} value={duration} onChange={event => setDuration(event.target.value)} /></label></section>
      </div>
      <section className="panel king-panel"><h3>Giocatori *</h3>{matchLowerScoreWins(game, modeId) && <p className="muted">Golf: il punteggio più basso è il migliore.</p>}<p className="play-player-count" aria-live="polite">{selected.length} {selected.length === 1 ? 'giocatore selezionato' : 'giocatori selezionati'} · minimo {MIN_PLAYERS}</p>
        <p className="muted" id="play-winner-help">Seleziona almeno un vincitore. In caso di pareggio, seleziona tutti i vincitori.</p>
        <div className="play-player-list">{players.map(player => <article key={player.id}>
          <label><input type="checkbox" checked={selected.includes(player.id)} onChange={event => setSelected(event.target.checked ? [...selected, player.id] : selected.filter(id => id !== player.id))} /> <b>{player.alias || player.name}</b>{player.alias && player.alias !== player.name && <small> ({player.name})</small>}</label>
          {selected.includes(player.id) && <div className="play-score-fields"><label className="field-label">Punteggio<input type="number" step="any" min={0} max={100000} value={scores[player.id] ?? ''} onChange={event => setScores({ ...scores, [player.id]: event.target.value })} placeholder="Punteggio" /></label><label><input type="checkbox" aria-describedby="play-winner-help" checked={winners.includes(player.id)} onChange={event => setWinners(event.target.checked ? [...winners, player.id] : winners.filter(id => id !== player.id))} /> Vincitore / Pareggio</label></div>}
        </article>)}</div>
        {winners.filter(id => selected.includes(id)).length > 0 && <p className="success-message">{winners.filter(id => selected.includes(id)).length} vincitori selezionati</p>}
        <button className="text-link" type="button" onClick={onAddPlayer}>+ Aggiungi giocatore al volo</button>
      </section>
      <section className="panel king-panel"><label className="field-label">Note<textarea maxLength={500} rows={4} value={notes} onChange={event => setNotes(event.target.value)} placeholder="Aggiungi note sulla partita…" /></label></section>
      {error && <p className="form-error" role="alert">{error}</p>}
      <footer className="play-form-footer"><button type="button" className="button button-secondary" disabled={busy} onClick={onCancel}>Annulla</button><button className="button button-primary" disabled={busy}><Save size={18} /> {busy ? 'Salvataggio…' : initialPlay ? 'Salva modifiche' : 'Salva Partita'}</button></footer>
    </form>
  </div>
}
