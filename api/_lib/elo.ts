import { simulateAllPlays, type SimulationPlay } from '../../src/elo/simulation.js'
import { simulateModePlays, type ModeSimulationPlay } from '../../src/elo/mode-simulation.js'
import { sql } from './db.js'
import { lowerScoreWins } from '../../src/game-rules.js'

/** Rebuilds the persisted snapshot with the same pure simulator used by KingScore. */
export async function recalculateElo() {
  const [run] = await sql`insert into public.elo_recalc_runs default values returning id`
  try {
    const rows = await sql`select p.id,p.game_id,p.mode_id,p.played_at,g.name as game_name,m.name as mode_name,
      json_agg(json_build_object('player_id',s.player_id,'score',s.score,'winner',s.winner,'position',s.position,'draw',s.draw,'players',json_build_object('name',pl.name,'alias',pl.alias)) order by s.player_id) as play_scores
      from public.plays p join public.games g on g.id=p.game_id left join public.game_modes m on m.game_id=p.game_id and m.id=p.mode_id
      join public.play_scores s on s.play_id=p.id join public.players pl on pl.id=s.player_id
      group by p.id,g.name,m.name order by p.played_at,p.id`
    const plays = rows.map(play => ({ ...play, lower_score_wins: lowerScoreWins(play.game_name, play.mode_name) }))
    const players = await sql`select id,user_id from public.players`
    const owners = new Map(players.map(p => [p.id, p.user_id]))
    const simulation = simulateAllPlays(plays as unknown as SimulationPlay[])
    const modeSimulation = simulateModePlays(plays as unknown as ModeSimulationPlay[])
    const modeRatings = Object.entries(modeSimulation.gamePlayers).flatMap(([key, states]) => {
      const [gameId, modeId] = JSON.parse(key) as [string, string | null]
      return modeId ? Object.values(states).map(s => ({ player_id:s.playerId,game_id:gameId,mode_id:modeId,rating:s.rating,games_played:s.gamesPlayed,wins:s.wins,losses:s.losses,draws:s.draws,last_played_at:s.lastPlayedAt })) : []
    })
    const modeHistory = modeSimulation.gameHistory.flatMap(s => {
      const [gameId, modeId] = JSON.parse(s.gameId) as [string, string | null]
      return modeId ? [{ play_id:s.playId,game_id:gameId,mode_id:modeId,player_id:s.playerId,rating:s.rating,rating_change:s.ratingChange,played_at:s.date }] : []
    })
    const gameRatings = Object.entries(simulation.gamePlayers).flatMap(([gameId, states]) => Object.values(states).map(s => ({ player_id:s.playerId,game_id:gameId,rating:s.rating,games_played:s.gamesPlayed,wins:s.wins,losses:s.losses,draws:s.draws,last_played_at:s.lastPlayedAt })))
    const generalRatings = Object.values(simulation.generalPlayers).map(s => ({ player_id:s.playerId,user_id:owners.get(s.playerId),rating:s.rating,games_played:s.gamesPlayed,wins:s.wins,losses:s.losses,draws:s.draws,last_played_at:s.lastPlayedAt }))
    const history = [
      ...simulation.gameHistory.map(s => ({ play_id:s.playId,game_id:s.gameId,player_id:s.playerId,player_name:s.playerName,rating:s.rating,rating_change:s.ratingChange,played_at:s.date,is_general:false,games_played:0,user_id:owners.get(s.playerId) })),
      ...simulation.generalHistory.map(s => ({ play_id:s.playId,game_id:null,player_id:s.playerId,player_name:s.playerName,rating:s.rating,rating_change:s.ratingChange,played_at:s.date,is_general:true,games_played:s.gamesPlayed,user_id:owners.get(s.playerId) })),
    ]
    const queries = [
      sql`select pg_advisory_xact_lock(921475)`,
      sql`delete from public.mode_elo_history`, sql`delete from public.player_mode_ratings`,
      sql`insert into public.player_mode_ratings (player_id,game_id,mode_id,rating,games_played,wins,losses,draws,last_played_at) select player_id,game_id,mode_id,rating,games_played,wins,losses,draws,last_played_at from jsonb_to_recordset(${JSON.stringify(modeRatings)}::jsonb) as x(player_id uuid,game_id text,mode_id text,rating int,games_played int,wins int,losses int,draws int,last_played_at timestamptz)`,
      sql`insert into public.mode_elo_history (play_id,game_id,mode_id,player_id,rating,rating_change,played_at) select play_id,game_id,mode_id,player_id,rating,rating_change,played_at from jsonb_to_recordset(${JSON.stringify(modeHistory)}::jsonb) as x(play_id uuid,game_id text,mode_id text,player_id uuid,rating int,rating_change int,played_at timestamptz)`,
      sql`delete from public.elo_history`, sql`delete from public.player_ratings`, sql`delete from public.player_general_ratings`,
      sql`insert into public.player_ratings (player_id,game_id,rating,games_played,wins,losses,draws,last_played_at) select player_id,game_id,rating,games_played,wins,losses,draws,last_played_at from jsonb_to_recordset(${JSON.stringify(gameRatings)}::jsonb) as x(player_id uuid,game_id text,rating int,games_played int,wins int,losses int,draws int,last_played_at timestamptz)`,
      sql`insert into public.player_general_ratings (player_id,user_id,rating,games_played,wins,losses,draws,last_played_at) select player_id,user_id,rating,games_played,wins,losses,draws,last_played_at from jsonb_to_recordset(${JSON.stringify(generalRatings)}::jsonb) as x(player_id uuid,user_id uuid,rating int,games_played int,wins int,losses int,draws int,last_played_at timestamptz)`,
      sql`insert into public.elo_history (play_id,game_id,player_id,player_name,rating,rating_change,played_at,is_general,games_played,user_id) select play_id,game_id,player_id,player_name,rating,rating_change,played_at,is_general,games_played,user_id from jsonb_to_recordset(${JSON.stringify(history)}::jsonb) as x(play_id uuid,game_id text,player_id uuid,player_name text,rating int,rating_change int,played_at timestamptz,is_general bool,games_played int,user_id uuid)`,
      sql`update public.elo_recalc_runs set status='completed',finished_at=now(),processed_plays=${simulation.processedPlays} where id=${run.id}`,
    ]
    await sql.transaction(queries)
    return { processed: simulation.processedPlays, skipped: simulation.skippedPlays }
  } catch (error) {
    await sql`update public.elo_recalc_runs set status='failed',finished_at=now(),error='Ricalcolo non riuscito' where id=${run.id}`
    throw error
  }
}
