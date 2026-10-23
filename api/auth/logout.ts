import type { VercelRequest, VercelResponse } from '@vercel/node'
import { clearSessionCookie, requireMethod } from '../_lib/auth.js'

export default function handler(request: VercelRequest, response: VercelResponse) {
  if (!requireMethod(request, response, 'POST')) return
  clearSessionCookie(response)
  return response.status(200).json({ ok: true })
}
