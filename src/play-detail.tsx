import { useMemo, useState } from 'react'
import { AlertTriangle, ArrowLeft, Calendar, Clock, Edit, Gamepad2, MapPin, Trash2, TrendingDown, TrendingUp, Trophy } from 'lucide-react'
import type { Game, Match, Player } from './data'
import type { Account } from './client'
import { modeLabel } from './game-modes'
import { getPlayElo, type PlayRating } from './play-elo'
import { rankedMatchResults } from './game-rules'
import { PlayComments } from './play-comments'

function RatingCell({ entry }: { entry?: PlayRating }) {
  return entry ? <div className="play-rating-cell"><b>{entry.rating}</b>{entry.ratingChange !== 0 && <span className={entry.ratingChange > 0 ? 'positive' : 'negative'}>{entry.ratingChange > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{entry.ratingChange > 0 ? '+' : ''}{entry.ratingChange}</span>}</div> : <span className="muted">-</span>
}

export function PlayDetailPage({ match, game, games, players, matches, account, demo, onBack, onEdit, onDelete, onDeleted, onLogin }: {
  match?: Match; game?: Game; games?: Game[]; players: Player[]; matches: Match[]; account: Account | null; demo: boolean;
  onBack: () => void; onEdit?: () => void; onDelete?: (id: string) => Promise<boolean>; onDeleted: () => void; onLogin: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false), [busy, setBusy] = useState(false), [deleteError, setDeleteError] = useState('')
  const [failedCover, setFailedCover] = useState<string | null>(null)
  const elo = useMemo(() => getPlayElo(players, matches, match?.id ?? '', games ?? (game ? [game] : [])), [players, matches, match?.id, games, game])
  if (!match) return <div className="king-play-empty"><Gamepad2 size={64} /><h2>Partita non trovata</h2><button className="text-link" onClick={onBack}>Torna allo storico</button></div>
  const playerMap = new Map(players.map(player => [player.id, player]))
  const sorted = rankedMatchResults(match, game)
  const tie = sorted.filter(result => result.winner).length > 1
  const hasModes = !!game?.modes?.length || !!match.modeId

  async function remove() {
    if (!onDelete || !match) return
    setBusy(true); setDeleteError('')
    try {
      if (await onDelete(match.id)) onDeleted()
      else setDeleteError('Non riesco a eliminare la partita. Riprova.')
    } catch { setDeleteError('Non riesco a eliminare la partita. Riprova.') } finally { setBusy(false) }
  }
  return <div className="king-play-detail">
    <header className="king-play-header"><div><button className="play-back" aria-label="Torna allo storico" onClick={onBack}><ArrowLeft size={20} /></button><div><h1>{game?.name ?? 'Gioco sconosciuto'}</h1><p>{new Date(match.playedAt).toLocaleDateString('it-IT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p></div></div>
      {(onEdit || onDelete) && <div className="play-header-actions">{onEdit && <button className="button button-secondary" onClick={onEdit}><Edit size={16} /> Modifica</button>}{onDelete && <button className="button play-delete-button" onClick={() => setConfirmDelete(true)}><Trash2 size={16} /> Elimina</button>}</div>}
    </header>
    <section className="king-play-card"><div className="play-info-layout">
      {game?.imageUrl && failedCover !== game.imageUrl ? <img className="play-cover" src={game.imageUrl} alt={game.name} onError={() => setFailedCover(game.imageUrl!)} /> : <div className="play-cover play-cover-placeholder"><Gamepad2 size={64} /></div>}
      <div className="play-info-body"><h2>{game?.name ?? 'Gioco sconosciuto'}</h2><div className="play-details-grid"><span><Calendar size={20} />{new Date(match.playedAt).toLocaleDateString('it-IT')}</span>{match.location && <span><MapPin size={20} />{match.location}</span>}{!!match.duration && <span><Clock size={20} />{match.duration} minuti</span>}</div>
        {modeLabel(game, match.modeId) && <div className="play-badges"><span className="badge-neutral">{modeLabel(game, match.modeId)}</span></div>}
      </div>
    </div>{match.notes && <div className="play-info-notes"><h3>Note</h3><p>{match.notes}</p></div>}</section>
    <PlayComments key={match.id} playId={match.id} account={account} demo={demo} onLogin={onLogin} />
    <section className="king-play-card"><h2>Punteggi</h2>{sorted.length ? <div className="play-table-scroll"><table className="play-results-table"><thead><tr>{['Posizione', 'Giocatore', 'Punteggio', 'Vincitore', ...(match.modeId ? ['ELO modalità'] : []), hasModes ? 'ELO gioco' : 'ELO', 'ELO Generale'].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{sorted.map(result => {
      const player = playerMap.get(result.playerId)
      return <tr key={result.playerId} className={result.winner ? 'play-winning-row' : ''}><td><span className={`play-position position-${Math.min(result.position, 4)}`}>{result.position}</span></td><td><span className="play-player-name">{player?.alias || player?.name || 'Sconosciuto'}</span>{player?.alias && player.alias !== player.name && <small className="play-player-real-name">({player.name})</small>}</td><td>{result.score}</td><td>{result.winner && <span className={`play-winner-label ${tie ? 'play-tie' : ''}`}><Trophy size={16} />{tie ? 'Pareggio' : 'Vincitore'}</span>}</td>{match.modeId && <td><RatingCell entry={elo.mode[result.playerId]} /></td>}<td><RatingCell entry={elo.game[result.playerId]} /></td><td><RatingCell entry={elo.general[result.playerId]} /></td></tr>
    })}</tbody></table></div> : <p className="muted">Nessun punteggio registrato per questa partita</p>}</section>
    {confirmDelete && <div className="modal-backdrop"><section className="play-delete-modal" role="dialog" aria-modal="true" aria-labelledby="play-delete-title"><header><span><AlertTriangle size={24} /></span><h3 id="play-delete-title">Conferma Eliminazione</h3></header><p>Sei sicuro di voler eliminare questa partita? Questa azione non può essere annullata.</p>{deleteError && <p role="alert" className="form-error">{deleteError}</p>}<footer><button className="button button-secondary" disabled={busy} onClick={() => setConfirmDelete(false)}>Annulla</button><button className="button play-delete-confirm" disabled={busy} onClick={() => void remove()}>{busy ? 'Eliminazione...' : 'Elimina'}</button></footer></section></div>}
  </div>
}
