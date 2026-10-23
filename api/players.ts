import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAdmin } from './_lib/auth.js'
import { sql } from './_lib/db.js'
import { validImage } from './_lib/permissions.js'

const colors = ['#b8a1ff', '#ff8b7b', '#f4c75e', '#68d9bd', '#83a9ff', '#eb79b9']

export default async function handler(request: VercelRequest, response: VercelResponse) {
  const user = await requireAdmin(request, response)
  if (!user) return
  const id = String(request.body?.id ?? request.query.id ?? '')
  if (['PATCH', 'DELETE'].includes(request.method ?? '') && !/^[a-f0-9-]{36}$/i.test(id)) return response.status(400).json({ error: 'ID giocatore non valido.' })
  if (request.method === 'DELETE') {
    const [used] = await sql`select play_id from public.play_scores where player_id=${id}::uuid limit 1`
    if (used) return response.status(409).json({ error: 'Non puoi eliminare un player con partite registrate.' })
    await sql`delete from public.players where id=${id}::uuid`
    return response.json({ ok: true })
  }
  if (!['POST', 'PATCH'].includes(request.method ?? '')) return response.status(405).json({ error: 'Metodo non consentito.' })
  const name = String(request.body?.name ?? '').trim()
  if (name.length < 2 || name.length > 32) return response.status(400).json({ error: 'Il nome deve contenere da 2 a 32 caratteri.' })
  if (request.method === 'PATCH') {
    const alias = String(request.body?.alias ?? '').trim()
    const accountId = request.body?.accountId || null
    if (accountId && !/^[a-f0-9-]{36}$/i.test(String(accountId))) return response.status(400).json({ error: 'Account non valido.' })
    const color = String(request.body?.color ?? '#10b981')
    let avatar: string | null
    try { avatar = validImage(request.body?.avatarUrl) } catch { return response.status(400).json({ error: 'Immagine non valida.' }) }
    if (!/^#[0-9a-f]{6}$/i.test(color)) return response.status(400).json({ error: 'Colore non valido.' })
    if (alias.length > 32) return response.status(400).json({ error: 'Alias troppo lungo.' })
    try {
      const [player] = await sql`update public.players set name=${name}, alias=${alias || null}, color=${color}, avatar_url=${avatar}, account_user_id=${accountId}::uuid where id=${id}::uuid returning id,name,alias,color,avatar_url,account_user_id`
      if (!player) return response.status(404).json({ error: 'Player non trovato.' })
      return response.json({ ...player, initials: name.slice(0, 2).toUpperCase() })
    } catch { return response.status(409).json({ error: 'Account non valido o già collegato a un altro giocatore.' }) }
  }
  const [count] = await sql`select count(*)::int as total from public.players where user_id = ${user.id}`
  const color = colors[Number(count.total) % colors.length]
  const [player] = await sql`insert into public.players (user_id, name, color) values (${user.id}, ${name}, ${color}) returning id, name, color`
  return response.status(201).json({ ...player, initials: name.slice(0, 2).toUpperCase() })
}
