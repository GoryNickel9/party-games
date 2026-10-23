import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from './db.js'

const COOKIE_NAME = 'partyscore_session'
const SESSION_SECONDS = 60 * 60 * 24 * 14

function secret() {
  const value = process.env.SESSION_SECRET
  if (!value || value.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters')
  return value
}

export function hashPassword(password: string) {
  const salt = randomBytes(16)
  const derived = scryptSync(password, salt, 64)
  return `${salt.toString('hex')}:${derived.toString('hex')}`
}

export function verifyPassword(password: string, stored: string) {
  const [saltHex, hashHex] = stored.split(':')
  if (!saltHex || !hashHex) return false
  const expected = Buffer.from(hashHex, 'hex')
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

function sign(value: string) {
  return createHmac('sha256', secret()).update(value).digest('base64url')
}

export function setSessionCookie(response: VercelResponse, userId: string, version = 0) {
  const payload = Buffer.from(JSON.stringify({ sub: userId, ver: version, exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS })).toString('base64url')
  const value = `${payload}.${sign(payload)}`
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  response.setHeader('Set-Cookie', `${COOKIE_NAME}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_SECONDS}${secure}`)
}

export function clearSessionCookie(response: VercelResponse) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  response.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`)
}

export async function authenticatedUser(request: VercelRequest) {
  const raw = request.cookies[COOKIE_NAME]
  if (!raw) return null
  const [payload, signature] = raw.split('.')
  if (!payload || !signature) return null
  const expected = Buffer.from(sign(payload))
  const actual = Buffer.from(signature)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { sub: string; exp: number; ver?: number }
    if (!Number.isFinite(parsed.exp) || parsed.exp < Date.now() / 1000) return null
    const [user] = await sql`select id, display_name, email, role, avatar_url, session_version from public.users where id = ${parsed.sub} limit 1`
    if (user && user.session_version !== (parsed.ver ?? 0)) return null
    return user ?? null
  } catch {
    return null
  }
}

export async function requireAdmin(request: VercelRequest, response: VercelResponse) {
  const user = await authenticatedUser(request)
  if (!user) { response.status(401).json({ error: 'Accedi per continuare.' }); return null }
  if (user.role !== 'admin') { response.status(403).json({ error: 'Questa funzione è riservata agli admin.' }); return null }
  response.setHeader('Cache-Control', 'private, no-store')
  return user
}

export function requireMethod(request: VercelRequest, response: VercelResponse, method: string) {
  if (request.method === method) return true
  response.setHeader('Allow', method)
  response.status(405).json({ error: 'Metodo non consentito.' })
  return false
}
