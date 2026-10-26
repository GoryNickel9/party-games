import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticatedUser, requireMethod } from './_lib/auth.js'
import { readLinkedPlayer, readPartyData } from './data.js'
import { dashboard, eloTable, matchesPage } from './_lib/mobile.js'
import { wrappedRecap } from './_lib/mobile-wrapped.js'
import type { PartyData } from '../src/data.js'
import { androidRelease } from './_lib/android-release.js'

/** Versioned, authenticated read API. Android never derives rankings or statistics. */
export default async function handler(request: VercelRequest, response: VercelResponse) {
  response.setHeader('Cache-Control', 'private, no-store')
  if (!requireMethod(request, response, 'GET')) return
  try {
    const user = await authenticatedUser(request)
    if (!user) return response.status(401).json({ error: 'Accedi per continuare.' })
    const query: Record<string, string> = {}
    for (const [key, value] of Object.entries(request.query)) {
      if (typeof value !== 'string' || value.length > 200 || !['resource', 'search', 'game', 'mode', 'year', 'month', 'page', 'player'].includes(key)) return response.status(400).json({ error: 'Filtro non valido.' })
      query[key] = value
    }
    if (!['dashboard', 'matches', 'elo', 'wrapped', 'update', 'download'].includes(query.resource)) return response.status(400).json({ error: 'Risorsa non valida.' })
    if (query.resource === 'update') return androidRelease(response)
    if (query.resource === 'download') return androidRelease(response, 'download')
    if ((query.page && !/^[1-9]\d{0,5}$/.test(query.page)) || (query.year && !/^\d{4}$/.test(query.year)) || (query.month && !/^(?:[1-9]|1[0-2])$/.test(query.month))) return response.status(400).json({ error: 'Pagina o data non valida.' })
    const data = await readPartyData() as PartyData
    if (query.resource === 'wrapped') {
      const personalId = await readLinkedPlayer(String(user.id))
      const allowed = data.players.filter(player => user.role === 'admin' || player.id === personalId)
      if (query.player && !allowed.some(player => player.id === query.player)) return response.status(403).json({ error: 'Puoi vedere solo il tuo Wrapped e quello generale.' })
      return response.status(200).json({ version: 1, generatedAt: new Date().toISOString(),
        ...wrappedRecap(data, query.year ? Number(query.year) : undefined, query.player), personalId,
        players: allowed.map(player => ({ id: player.id, name: player.alias || player.name })),
      })
    }
    const game = data.games.find(g => g.id === query.game)
    if ((query.game && !game) || (query.mode && !game?.modes?.some(m => m.id === query.mode))) return response.status(400).json({ error: 'Gioco o modalità non validi.' })
    const result = query.resource === 'dashboard' ? dashboard(data) : query.resource === 'matches' ? matchesPage(data, query) : eloTable(data, query.game, query.mode)
    return response.status(200).json({ version: 1, generatedAt: new Date().toISOString(), ...result })
  } catch (error) {
    console.error('mobile_read_failed', error instanceof Error ? error.message : 'unknown')
    return response.status(500).json({ error: 'Impossibile caricare i dati. Riprova.' })
  }
}
