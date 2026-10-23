import { randomUUID } from 'node:crypto'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAdmin } from './_lib/auth.js'
import { validImage } from './_lib/permissions.js'
import { sql } from './_lib/db.js'
import { MIN_PLAYERS } from '../src/game-rules.js'
import { validateModes } from '../src/game-modes.js'
import { recalculateElo } from './_lib/elo.js'
import type { GameMode } from '../src/data.js'

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!await requireAdmin(request, response)) return
  if (!['POST', 'PATCH', 'DELETE'].includes(request.method ?? '')) return response.status(405).json({ error: 'Metodo non consentito.' })
  const id = String(request.body?.id ?? request.query.id ?? '')
  if (request.method === 'DELETE') {
    const [used] = await sql`select id from public.plays where game_id = ${id} limit 1`
    if (used) return response.status(409).json({ error: 'Non puoi eliminare un gioco con partite registrate.' })
    await sql`delete from public.games where id = ${id}`
    return response.json({ ok: true })
  }
  const name = String(request.body?.name ?? '').trim()
  const platform = String(request.body?.platform ?? '').trim()
  const category = String(request.body?.category ?? 'Party').trim()
  const min = Number(request.body?.minPlayers ?? MIN_PLAYERS), max = Number(request.body?.maxPlayers ?? 4)
  if (min !== MIN_PLAYERS) return response.status(400).json({ error: 'Il minimo dei giocatori è sempre 2.' })
  if (name.length < 2 || name.length > 160 || !platform || platform.length > 80 || category.length > 80 || !Number.isInteger(max) || max < MIN_PLAYERS || max > 12) return response.status(400).json({ error: 'Controlla nome, console e numero massimo di giocatori (2–12).' })
  let image: string | null
  try { image = validImage(request.body?.imageUrl) } catch { return response.status(400).json({ error: 'Copertina non valida: usa HTTPS oppure un’immagine PNG, JPEG o WebP inferiore a 350 KB.' }) }
  const gameId = request.method === 'PATCH' ? id : randomUUID()
  const stored = request.method === 'PATCH' ? await sql`select id,name,active from public.game_modes where game_id=${gameId}` : []
  if (request.method === 'PATCH') {
    const [existing] = await sql`select id from public.games where id=${gameId}`
    if (!existing) return response.status(404).json({ error: 'Gioco non trovato.' })
  }
  let modes: GameMode[]
  try { modes = validateModes(request.body?.modes ?? (request.method === 'PATCH' ? stored : [])) }
  catch (error) { return response.status(400).json({ error: error instanceof Error ? error.message : 'Modalità non valide.' }) }
  const removedIds = stored.filter(mode => !modes.some(item => item.id === mode.id)).map(mode => mode.id)
  const conflicts = await sql`select id from public.game_modes where id=any(${modes.map(mode => mode.id)}::text[]) and game_id<>${gameId}`
  if (conflicts.length) return response.status(400).json({ error: 'Una modalità appartiene a un altro gioco.' })
  try {
    const [rows, , , modeRows] = await sql.transaction([
      request.method === 'PATCH'
        ? sql`update public.games set name=${name}, platform=${platform}, category=${category}, min_players=${min}, max_players=${max}, image_url=${image} where id=${gameId} returning id,name,platform,category,min_players,max_players,image_url,emoji,accent`
        : sql`insert into public.games (id,name,platform,category,min_players,max_players,image_url,emoji,accent) values (${gameId},${name},${platform},${category},${min},${max},${image},'🎮','#10b981') returning id,name,platform,category,min_players,max_players,image_url,emoji,accent`,
      sql`update public.plays set mode_id=null where game_id=${gameId} and mode_id=any(${removedIds}::text[])`,
      sql`delete from public.game_modes where game_id=${gameId} and id=any(${removedIds}::text[])`,
      sql`insert into public.game_modes (id,game_id,name,active)
        select id,${gameId},name,active from jsonb_to_recordset(${JSON.stringify(modes)}::jsonb) as x(id text,name text,active boolean)
        on conflict (id) do update set name=excluded.name,active=excluded.active where game_modes.game_id=excluded.game_id returning id,name,active`,
    ])
    const game = rows[0]
    if (!game) return response.status(404).json({ error: 'Gioco non trovato.' })
    let eloUpdated = true
    if (removedIds.length) {
      try { await recalculateElo() } catch (error) { eloUpdated = false; console.error('ELO cache update failed after removing modes', error) }
    }
    return response.status(request.method === 'POST' ? 201 : 200).json({ ...game, modes: modeRows, eloUpdated, imageUrl: game.image_url, minPlayers: game.min_players, maxPlayers: game.max_players })
  } catch (error) {
    console.error('Could not save game modes', error)
    return response.status(409).json({ error: 'Salvataggio non riuscito. Controlla che i nomi delle modalità siano distinti e ricarica il gioco.' })
  }
}
