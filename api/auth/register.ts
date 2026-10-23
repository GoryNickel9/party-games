import { randomUUID } from 'node:crypto'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { hashPassword, requireMethod, setSessionCookie } from '../_lib/auth.js'
import { sql } from '../_lib/db.js'

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!requireMethod(request, response, 'POST')) return
  const [settings] = await sql`select registrations_open from public.app_settings where id = true`
  if (!settings?.registrations_open) return response.status(403).json({ error: 'Le registrazioni sono chiuse.' })
  const displayName = String(request.body?.displayName ?? '').trim()
  const email = String(request.body?.email ?? '').trim().toLowerCase()
  const password = String(request.body?.password ?? '')
  if (displayName.length < 2 || displayName.length > 32 || !/^\S+@\S+\.\S+$/.test(email) || password.length < 10 || password.length > 200) {
    return response.status(400).json({ error: 'Inserisci un nome, un’email valida e una password di almeno 10 caratteri.' })
  }
  try {
    const userId = randomUUID()
    const [user] = await sql`insert into public.users (id, display_name, email, password_hash) values (${userId}, ${displayName}, ${email}, ${hashPassword(password)}) returning id, display_name, email, role, avatar_url`
    setSessionCookie(response, user.id)
    return response.status(201).json({ user })
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
      return response.status(409).json({ error: 'Esiste già un account con questa email.' })
    }
    console.error('Account registration failed', error)
    return response.status(500).json({ error: 'Non riesco a creare l’account. Riprova.' })
  }
}
