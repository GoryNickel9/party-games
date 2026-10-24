import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticatedUser, requireMethod } from './_lib/auth.js'
import { readPartyData } from './data.js'
import { dashboard, eloTable, matchesPage } from './_lib/mobile.js'
import type { PartyData } from '../src/data.js'
import { androidRelease } from './_lib/android-release.js'

/** Versioned, authenticated read API. Android never derives rankings or statistics. */
export default async function handler(request: VercelRequest, response: VercelResponse) {
  response.setHeader('Cache-Control', 'private, no-store')
  if (!requireMethod(request, response, 'GET')) return
  try {
    if (!await authenticatedUser(request)) return response.status(401).json({ error: 'Accedi per continuare.' })
    const query: Record<string, string> = {}
    for (const [key, value] of Object.entries(request.query)) {
      if (typeof value !== 'string' || value.length > 200 || !['resource', 'search', 'game', 'mode', 'year', 'month', 'page'].includes(key)) return response.status(400).json({ error: 'Filtro non valido.' })
      query[key] = value
    }
    if (!['dashboard', 'matches', 'elo', 'update', 'download'].includes(query.resource)) return response.status(400).json({ error: 'Risorsa non valida.' })
    if (query.resource === 'update') return androidRelease(response)
    if (query.resource === 'download') return androidRelease(response, 'download')
    if ((query.page && !/^[1-9]\d{0,5}$/.test(query.page)) || (query.year && !/^\d{4}$/.test(query.year)) || (query.month && !/^(?:[1-9]|1[0-2])$/.test(query.month))) return response.status(400).json({ error: 'Pagina o data non valida.' })
    const data = await readPartyData() as PartyData
    const game = data.games.find(g => g.id === query.game)
    if ((query.game && !game) || (query.mode && !game?.modes?.some(m => m.id === query.mode))) return response.status(400).json({ error: 'Gioco o modalità non validi.' })
    const result = query.resource === 'dashboard' ? dashboard(data) : query.resource === 'matches' ? matchesPage(data, query) : eloTable(data, query.game, query.mode)
    return response.status(200).json({ version: 1, generatedAt: new Date().toISOString(), ...result })
  } catch (error) {
    console.error('mobile_read_failed', error instanceof Error ? error.message : 'unknown')
    return response.status(500).json({ error: 'Impossibile caricare i dati. Riprova.' })
  }
}
