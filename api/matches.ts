import { randomUUID } from 'node:crypto'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAdmin } from './_lib/auth.js'
import { assignPositions } from '../src/elo/positions.js'
import { recalculateElo } from './_lib/elo.js'
import { sql } from './_lib/db.js'
import { MIN_PLAYERS, lowerScoreWins, playSelectionError } from '../src/game-rules.js'
import type { GameMode } from '../src/data.js'

export default async function handler(request: VercelRequest, response: VercelResponse) {
  const user = await requireAdmin(request, response)
  if (!user) return
  if (request.method === 'DELETE') {
    const id = String(request.query.id ?? '')
    if (!/^[a-f0-9-]{36}$/i.test(id)) return response.status(400).json({ error: 'ID partita non valido.' })
    const deleted = await sql`delete from public.plays where id = ${id} returning id`
    if (!deleted.length) return response.status(404).json({ error: 'Partita non trovata.' })
    let eloUpdated = true
    try { await recalculateElo() } catch (error) { eloUpdated = false; console.error('ELO cache update failed after delete', error) }
    return response.status(200).json({ ok: true, eloUpdated })
  }
  const editing = request.method === 'PATCH'
  if (!editing && request.method !== 'POST') {
    response.setHeader('Allow', 'POST, PATCH, DELETE')
    return response.status(405).json({ error: 'Metodo non consentito.' })
  }
  const matchId = editing ? String(request.body?.id ?? request.query.id ?? '') : randomUUID()
  if (editing && !/^[a-f0-9-]{36}$/i.test(matchId)) return response.status(400).json({ error: 'ID partita non valido.' })
  const [existing] = editing ? await sql`select id,game_id,mode_id from public.plays where id=${matchId}` : []
  if (editing && !existing) return response.status(404).json({ error: 'Partita non trovata.' })
  if (editing && request.body?.gameId !== undefined && request.body.gameId !== existing!.game_id) return response.status(400).json({ error: 'Non puoi cambiare il gioco di una partita esistente.' })
  const gameId = editing ? String(existing!.game_id) : String(request.body?.gameId ?? '')
  const requestedMode = request.body?.modeId === undefined ? existing?.mode_id : request.body.modeId
  const modeId = requestedMode == null || requestedMode === '' ? null : String(requestedMode)
  const playedAtInput = String(request.body?.playedAt ?? '')
  const duration = request.body?.duration == null || Number(request.body.duration) === 0 ? null : Number(request.body.duration)
  const notes = String(request.body?.notes ?? '').trim() || null
  const location = String(request.body?.location ?? '').trim() || null
  const results = request.body?.results
  if (!Array.isArray(results) || results.length < MIN_PLAYERS) return response.status(400).json({ error: 'Seleziona almeno 2 giocatori.' })
  if (results.some(result => !result || typeof result !== 'object')) return response.status(400).json({ error: 'Risultati dei giocatori non validi.' })
  if (!gameId || !Number.isFinite(Date.parse(playedAtInput)) || (duration !== null && (!Number.isInteger(duration) || duration < 1 || duration > 1440)) || results.length > 12) {
    return response.status(400).json({ error: 'Controlla gioco, data, durata e partecipanti.' })
  }
  const playedAt = new Date(playedAtInput).toISOString()
  const playerIds = results.map((result: { playerId?: unknown }) => String(result.playerId ?? ''))
  const scores = results.map((result: { score?: unknown }) => Number(result.score))
  if ((notes?.length ?? 0) > 500 || (location?.length ?? 0) > 120 || playerIds.some((id: string) => !/^[a-f0-9-]{36}$/i.test(id)) || new Set(playerIds).size !== playerIds.length || scores.some((score: number) => !Number.isFinite(score) || score < 0 || score > 100000)) {
    return response.status(400).json({ error: 'I punteggi devono essere non negativi e i giocatori non ripetuti.' })
  }
  const [validGame] = await sql`select id,name from public.games where id = ${gameId} limit 1`
  if (!validGame) return response.status(400).json({ error: 'Gioco non valido.' })
  const modes = await sql`select id,name,active from public.game_modes where game_id = ${gameId}` as GameMode[]
  const selectionError = playSelectionError(modes, modeId, results, existing?.mode_id)
  if (selectionError) return response.status(400).json({ error: selectionError })
  const modeName = modes.find(mode => mode.id === modeId)?.name ?? ''
  const allowed = await sql`select id from public.players where id = any(${playerIds}::uuid[])`
  if (allowed.length !== playerIds.length) return response.status(400).json({ error: 'Uno o più giocatori non sono validi.' })
  const lowScore = lowerScoreWins(String(validGame.name), modeName)
  const winners = results.map((result: { winner?: boolean }) => result.winner === true)
  const winnerCount = winners.filter(Boolean).length
  const ranked = assignPositions(playerIds.map((playerId: string, index: number) => ({ playerId, score: scores[index], winner: !!winners[index] })), { lowerScoreWins: lowScore })
  try {
    const queries = [
      editing
        ? sql`update public.plays set mode_id=${modeId},played_at=${playedAt},duration_minutes=${duration},notes=${notes},location=${location},source='offline',is_cooperative=false,team_won=null where id=${matchId} returning id`
        : sql`insert into public.plays (id, user_id, game_id, mode_id, played_at, duration_minutes, notes, location, source, is_cooperative, team_won) values (${matchId}, ${user.id}, ${gameId}, ${modeId}, ${playedAt}, ${duration}, ${notes}, ${location}, 'offline', false, null) returning id`,
      ...(editing ? [sql`delete from public.play_scores where play_id=${matchId}`] : []),
      ...playerIds.map((playerId: string, index: number) => sql`insert into public.play_scores (play_id, player_id, score, winner, position, draw) values (${matchId}, ${playerId}, ${scores[index]}, ${winners[index]}, ${ranked.find(entry => entry.playerId === playerId)!.position}, ${winnerCount > 1 && winners[index]})`),
    ]
    await sql.transaction(queries)
  } catch (error) {
    console.error('Could not save match', error)
    return response.status(500).json({ error: 'Non riesco a salvare la partita.' })
  }
  let eloUpdated = true
  try { await recalculateElo() } catch (error) { eloUpdated = false; console.error('ELO cache update failed after save', error) }
  return response.status(editing ? 200 : 201).json({ id: matchId, eloUpdated })
}
