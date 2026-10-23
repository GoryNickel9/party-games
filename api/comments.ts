import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticatedUser } from './_lib/auth.js'
import { sql } from './_lib/db.js'
import { normalizePlayCommentContent } from '../src/play-comments-data.js'

const validId = (value: string) => /^[a-f0-9-]{36}$/i.test(value)

export default async function handler(request: VercelRequest, response: VercelResponse) {
  response.setHeader('Cache-Control', 'no-store')
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(request.method ?? '')) {
    response.setHeader('Allow', 'GET, POST, PATCH, DELETE')
    return response.status(405).json({ error: 'Metodo non consentito.' })
  }
  if (request.method === 'GET') {
    if (request.query.playIds !== undefined) {
      const ids = String(request.query.playIds).split(',')
      if (!ids.length || ids.length > 20 || ids.some(id => !validId(id))) return response.status(400).json({ error: 'Seleziona da 1 a 20 partite valide.' })
      const rows = await sql`select play_id,count(*)::int as count from public.play_comments where play_id=any(${ids}::uuid[]) group by play_id`
      return response.json({ counts: Object.fromEntries(rows.map(row => [row.play_id, row.count])) })
    }
    const playId = String(request.query.playId ?? '')
    if (!validId(playId)) return response.status(400).json({ error: 'ID partita non valido.' })
    const [play] = await sql`select id from public.plays where id=${playId}`
    if (!play) return response.status(404).json({ error: 'Partita non trovata.' })
    const comments = await sql`select c.id,c.play_id,c.user_id,c.author_name,c.content,c.created_at,c.updated_at,u.avatar_url as author_avatar_url
      from public.play_comments c join public.users u on u.id=c.user_id where c.play_id=${playId} order by c.created_at,c.id`
    return response.json({ comments })
  }
  const user = await authenticatedUser(request)
  if (!user) return response.status(401).json({ error: 'Accedi per continuare.' })
  const id = String(request.body?.id ?? request.query.id ?? '')
  if (request.method !== 'POST') {
    if (!validId(id)) return response.status(400).json({ error: 'ID commento non valido.' })
    const [comment] = await sql`select user_id from public.play_comments where id=${id}`
    if (!comment) return response.status(404).json({ error: 'Commento non trovato.' })
    if (comment.user_id !== user.id) return response.status(403).json({ error: 'Puoi modificare o eliminare soltanto i tuoi commenti.' })
    if (request.method === 'DELETE') {
      await sql`delete from public.play_comments where id=${id} and user_id=${user.id}`
      return response.json({ ok: true })
    }
  }
  let content: string
  try { content = normalizePlayCommentContent(request.body?.content) }
  catch (error) { return response.status(400).json({ error: error instanceof Error ? error.message : 'Commento non valido.' }) }
  if (request.method === 'POST') {
    const playId = String(request.body?.playId ?? '')
    if (!validId(playId)) return response.status(400).json({ error: 'ID partita non valido.' })
    const [play] = await sql`select id from public.plays where id=${playId}`
    if (!play) return response.status(404).json({ error: 'Partita non trovata.' })
    const [comment] = await sql`insert into public.play_comments (play_id,user_id,author_name,content) values (${playId},${user.id},${user.display_name},${content}) returning *`
    return response.status(201).json({ ...comment, author_avatar_url: user.avatar_url ?? null })
  }
  const [comment] = await sql`update public.play_comments set content=${content},updated_at=now() where id=${id} and user_id=${user.id} returning *`
  if (!comment) return response.status(404).json({ error: 'Commento non trovato.' })
  return response.json({ ...comment, author_avatar_url: user.avatar_url ?? null })
}
