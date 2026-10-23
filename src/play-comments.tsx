import { useEffect, useState } from 'react'
import { Check, MessageCircle, Pencil, Send, Trash2, X } from 'lucide-react'
import { api, type Account } from './client'
import { MAX_PLAY_COMMENT_LENGTH, normalizePlayCommentContent, type PlayComment } from './play-comments-data'

const message = (error: unknown) => error instanceof Error ? error.message : 'Operazione non riuscita.'
const demoKey = (playId: string) => `partyscore.comments.${playId}`
function readDemo(playId: string): PlayComment[] {
  try { const comments = JSON.parse(localStorage.getItem(demoKey(playId)) ?? '[]'); return Array.isArray(comments) ? comments : [] } catch { return [] }
}

export function PlayComments({ playId, account, demo, onLogin }: { playId: string; account: Account | null; demo: boolean; onLogin: () => void }) {
  const [comments, setComments] = useState<PlayComment[]>([])
  const [draft, setDraft] = useState(''), [editingId, setEditingId] = useState<string | null>(null), [editDraft, setEditDraft] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let active = true
    setLoading(true); setError('')
    const request = demo ? Promise.resolve({ comments: readDemo(playId) }) : api<{ comments: PlayComment[] }>(`/api/comments?playId=${encodeURIComponent(playId)}`)
    void request.then(result => { if (active) setComments(result.comments) }).catch(caught => { if (active) setError(message(caught)) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [playId, demo, reload])

  function update(next: PlayComment[]) { setComments(next); if (demo) localStorage.setItem(demoKey(playId), JSON.stringify(next)) }
  async function save(id?: string) {
    if (!account) return
    setError(''); setBusy(true)
    try {
      const content = normalizePlayCommentContent(id ? editDraft : draft)
      const now = new Date().toISOString()
      const previous = comments.find(comment => comment.id === id)
      const comment = demo
        ? { id: id ?? crypto.randomUUID(), play_id: playId, user_id: account.id, author_name: previous?.author_name ?? account.display_name, author_avatar_url: account.avatar_url, content, created_at: previous?.created_at ?? now, updated_at: now }
        : await api<PlayComment>('/api/comments', { method: id ? 'PATCH' : 'POST', body: JSON.stringify({ id, playId, content }) })
      update(id ? comments.map(item => item.id === id ? comment : item) : [...comments, comment])
      if (id) { setEditingId(null); setEditDraft('') } else setDraft('')
    } catch (caught) { setError(message(caught)) } finally { setBusy(false) }
  }
  async function remove(id: string) {
    setError(''); setBusy(true)
    try {
      if (!demo) await api(`/api/comments?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      update(comments.filter(comment => comment.id !== id)); setDeletingId(null)
    } catch (caught) { setError(message(caught)) } finally { setBusy(false) }
  }
  return <section className="king-play-card play-comments" aria-labelledby="play-comments-title">
    <header className="play-comments-heading"><span><MessageCircle size={20} /></span><div><h2 id="play-comments-title">Commenti</h2><p>{comments.length} {comments.length === 1 ? 'commento' : 'commenti'}</p></div></header>
    {loading ? <p className="muted" role="status">Caricamento commenti...</p> : error ? <div className="play-comment-error"><p className="form-error" role="alert">{error}</p><button className="text-link" onClick={() => setReload(reload + 1)}>Riprova</button></div> : !comments.length ? <p className="play-comments-empty">Ancora nessun commento. Inizia tu la conversazione.</p> : <ul className="play-comment-list">{comments.map(comment => <li key={comment.id}>
      {comment.author_avatar_url ? <img className="play-comment-avatar" src={comment.author_avatar_url} alt={`${comment.author_name} · immagine profilo`} /> : <span className="play-comment-avatar" aria-hidden="true">{comment.author_name.trim().charAt(0).toLocaleUpperCase('it-IT') || 'U'}</span>}
      <div className="play-comment-body"><header><b>{comment.author_name}</b><time dateTime={comment.updated_at}>{new Date(comment.updated_at).toLocaleString('it-IT', { dateStyle: 'medium', timeStyle: 'short' })}{comment.updated_at !== comment.created_at && ' · modificato'}</time></header>
        {editingId === comment.id ? <div className="play-comment-edit"><textarea aria-label="Modifica commento" value={editDraft} onChange={event => setEditDraft(event.target.value)} maxLength={MAX_PLAY_COMMENT_LENGTH} rows={3} /><div><small>{editDraft.length}/{MAX_PLAY_COMMENT_LENGTH}</small><button className="button button-secondary" disabled={busy} onClick={() => setEditingId(null)}><X size={16} /> Annulla</button><button className="button button-primary" disabled={busy} onClick={() => void save(comment.id)}><Check size={16} /> Salva</button></div></div> : <p>{comment.content}</p>}
        {account?.id === comment.user_id && editingId !== comment.id && <div className="play-comment-actions">{deletingId === comment.id ? <><span>Eliminare questo commento?</span><button disabled={busy} onClick={() => void remove(comment.id)}>Elimina</button><button disabled={busy} onClick={() => setDeletingId(null)}>Annulla</button></> : <><button onClick={() => { setEditingId(comment.id); setEditDraft(comment.content); setDeletingId(null) }}><Pencil size={12} /> Modifica</button><button onClick={() => setDeletingId(comment.id)}><Trash2 size={12} /> Elimina</button></>}</div>}
      </div>
    </li>)}</ul>}
    <div className="play-comment-compose">{account ? <form onSubmit={event => { event.preventDefault(); void save() }}><label htmlFor="new-play-comment">Lascia un commento</label><textarea id="new-play-comment" value={draft} onChange={event => setDraft(event.target.value)} maxLength={MAX_PLAY_COMMENT_LENGTH} rows={3} placeholder="Com’è andata la partita?" /><footer><small>{draft.length}/{MAX_PLAY_COMMENT_LENGTH}</small><button className="button button-primary" disabled={busy || !draft.trim()}><Send size={16} /> Pubblica</button></footer></form> : <p><button className="text-link" onClick={onLogin}>Accedi</button> per lasciare un commento.</p>}</div>
  </section>
}
