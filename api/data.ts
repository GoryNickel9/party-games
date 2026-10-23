import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireMethod } from './_lib/auth.js'
import { sql } from './_lib/db.js'

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!requireMethod(request, response, 'GET')) return
  response.setHeader('Cache-Control', 'no-store')
  const [players, games, plays, modes] = await Promise.all([
    sql`select id, name, alias, color, avatar_url from public.players order by name`,
    sql`select id, name, platform, category, emoji, accent, image_url, min_players, max_players from public.games order by name`,
    sql`select p.id, p.game_id, p.mode_id, p.played_at, p.duration_minutes, p.notes, p.location, p.source, p.is_cooperative, p.team_won,
      coalesce(json_agg(json_build_object('playerId', s.player_id, 'score', s.score, 'winner', s.winner, 'position', s.position, 'draw', s.draw)) filter (where s.player_id is not null), '[]') as results
      from public.plays p left join public.play_scores s on s.play_id = p.id
      group by p.id order by p.played_at desc, p.id`,
    sql`select id, game_id, name, active from public.game_modes order by name, id`,
  ])
  return response.status(200).json({
    players: players.map((player) => ({ ...player, initials: String(player.name).slice(0, 2).toUpperCase() })),
    games: games.map((game) => ({ ...game, modes: modes.filter(mode => mode.game_id === game.id).map(({ id, name, active }) => ({ id, name, active })), minPlayers: game.min_players, maxPlayers: game.max_players, imageUrl: game.image_url })),
    matches: plays.map((play) => ({ ...play, gameId: play.game_id, modeId: play.mode_id, playedAt: play.played_at, duration: play.duration_minutes ?? 0, cooperative: play.is_cooperative, teamWon: play.team_won, results: play.results })),
  })
}
