import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireMethod, setSessionCookie, verifyPassword } from '../_lib/auth.js'
import { sql } from '../_lib/db.js'

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!requireMethod(request, response, 'POST')) return
  const email = String(request.body?.email ?? '').trim().toLowerCase()
  const password = String(request.body?.password ?? '')
  const [user] = await sql`select id, display_name, email, role, avatar_url, session_version, password_hash from public.users where email = ${email} limit 1`
  if (!user || !verifyPassword(password, user.password_hash)) return response.status(401).json({ error: 'Email o password non corretti.' })
  await sql`update public.users set last_login_at = now() where id = ${user.id}`
  setSessionCookie(response, user.id, user.session_version)
  return response.status(200).json({ user: { id: user.id, display_name: user.display_name, email: user.email, role: user.role, avatar_url: user.avatar_url } })
}
