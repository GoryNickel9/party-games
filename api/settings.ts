import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticatedUser, hashPassword, setSessionCookie, verifyPassword } from './_lib/auth.js'
import { validImage } from './_lib/permissions.js'
import { sql } from './_lib/db.js'

export default async function handler(request: VercelRequest, response: VercelResponse) {
  const user = await authenticatedUser(request)
  if (!user) return response.status(401).json({ error: 'Accedi per continuare.' })
  response.setHeader('Cache-Control', 'private, no-store')
  if (request.method !== 'PATCH') return response.status(405).json({ error: 'Metodo non consentito.' })
  const action = request.body?.action
  try {
    if (action === 'profile') {
      const name = String(request.body?.displayName ?? '').trim()
      if (name.length < 2 || name.length > 32) return response.status(400).json({ error: 'Il nome deve contenere da 2 a 32 caratteri.' })
      const avatar = validImage(request.body?.avatarUrl)
      await sql.transaction([
        sql`update public.users set display_name=${name}, avatar_url=${avatar} where id=${user.id}`,
        sql`update public.players set avatar_url=${avatar} where account_user_id=${user.id}`,
      ])
    } else if (action === 'email' || action === 'password') {
      const [stored] = await sql`select password_hash from public.users where id=${user.id}`
      if (!verifyPassword(String(request.body?.currentPassword ?? ''), stored.password_hash)) return response.status(400).json({ error: 'La password attuale non è corretta.' })
      if (action === 'email') {
        const email = String(request.body?.email ?? '').trim().toLowerCase()
        if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) return response.status(400).json({ error: 'Email non valida.' })
        await sql`update public.users set email=${email}, session_version=session_version+1 where id=${user.id}`
      } else {
        const password = String(request.body?.newPassword ?? '')
        if (password.length < 10 || password.length > 200) return response.status(400).json({ error: 'La password deve contenere da 10 a 200 caratteri.' })
        await sql`update public.users set password_hash=${hashPassword(password)}, session_version=session_version+1 where id=${user.id}`
      }
      setSessionCookie(response, user.id, user.session_version + 1)
    } else return response.status(400).json({ error: 'Operazione non valida.' })
    const [updated] = await sql`select id, display_name, email, role, avatar_url from public.users where id=${user.id}`
    return response.json({ user: updated })
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') return response.status(409).json({ error: 'Email già utilizzata.' })
    return response.status(400).json({ error: 'Impossibile aggiornare le impostazioni. Controlla i dati.' })
  }
}
