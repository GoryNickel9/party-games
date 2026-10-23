import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticatedUser, requireMethod } from '../_lib/auth.js'

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!requireMethod(request, response, 'GET')) return
  const user = await authenticatedUser(request)
  if (!user) return response.status(401).json({ error: 'Sessione non valida.' })
  return response.status(200).json({ user })
}
