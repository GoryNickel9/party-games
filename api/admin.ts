import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAdmin } from './_lib/auth.js'
import { recalculateElo } from './_lib/elo.js'
import { sql } from './_lib/db.js'

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!await requireAdmin(request, response)) return
  if (request.method === 'PATCH') {
    if (typeof request.body?.registrationsOpen !== 'boolean') return response.status(400).json({ error: 'Impostazione non valida.' })
    await sql`update public.app_settings set registrations_open=${request.body.registrationsOpen} where id=true`
    return response.json({ ok: true })
  }
  if (request.method === 'POST') {
    try { return response.json(await recalculateElo()) }
    catch (error) { console.error('ELO recalc failed', error); return response.status(500).json({ error: 'Il ricalcolo ELO non è riuscito. Riprova.' }) }
  }
  if (request.method !== 'GET') return response.status(405).json({ error: 'Metodo non consentito.' })
  const [users, players, summary, settings, runs] = await Promise.all([
    sql`select id,display_name,email,role,created_at,last_login_at from public.users order by created_at desc`,
    sql`select id,name,alias,color,avatar_url,account_user_id from public.players order by name`,
    sql`select (select count(*) from public.plays)::int as plays,(select count(*) from public.games)::int as games,(select count(*) from public.players)::int as players,(select count(*) from public.users)::int as registrations`,
    sql`select registrations_open from public.app_settings where id=true`,
    sql`select id,started_at,finished_at,processed_plays,status from public.elo_recalc_runs order by id desc limit 1`,
  ])
  return response.json({ users, players, summary: summary[0], registrationsOpen: settings[0].registrations_open, lastRecalc: runs[0] ?? null })
}
