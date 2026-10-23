import { randomUUID } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'
const branchUrl = process.env.NEON_TEST_DATABASE_URL
it.skipIf(!branchUrl)('persists KingScore ELO in an isolated Neon branch', async () => {
  if (!branchUrl || !['ep-silent-mountain-b19p2xdj', 'ep-round-shape-b11z5hgd'].some(endpoint => new URL(branchUrl).hostname.split('.')[0].replace(/-pooler$/, '') === endpoint)) throw new Error('This integration test requires an explicitly allowed test branch.')
  process.env.DATABASE_URL = branchUrl
  const { sql } = await import('../api/_lib/db')
  const { recalculateElo } = await import('../api/_lib/elo')
  const userId=randomUUID(), playerA=randomUUID(), playerB=randomUUID(), playerC=randomUUID(), commenterId=randomUUID(), gameId=randomUUID(), playId=randomUUID()
  let createdGameId = ''
  try {
    await sql.transaction([
      sql`insert into public.users (id,display_name,email,password_hash,role) values (${userId},'Integration test',${`${userId}@example.invalid`},'not-a-login','admin')`,
      sql`insert into public.games (id,name,platform,category) values (${gameId},'Integration game','Console','Party')`,
      sql`insert into public.players (id,user_id,name,color) values (${playerA},${userId},'Player A','#10b981'),(${playerB},${userId},'Player B','#38bdf8')`,
      sql`insert into public.plays (id,user_id,game_id,played_at,duration_minutes) values (${playId},${userId},${gameId},'2026-01-01T12:00:00Z',30)`,
      sql`insert into public.play_scores (play_id,player_id,score,winner,position) values (${playId},${playerA},10,true,1),(${playId},${playerB},5,false,2)`,
    ])
    const run = await recalculateElo()
    expect(run.processed).toBeGreaterThanOrEqual(1)
    const ratings = await sql`select player_id,rating,games_played from public.player_ratings where game_id=${gameId}`
    expect(ratings.find(row => row.player_id===playerA)?.rating).toBe(1024)
    expect(ratings.find(row => row.player_id===playerB)?.rating).toBe(976)
    const general = await sql`select rating from public.player_general_ratings where player_id=${playerA}`
    expect(general[0].rating).toBe(1024)
    const history = await sql`select is_general,rating from public.elo_history where play_id=${playId}`
    expect(history).toHaveLength(4)
    expect(history.filter(row => row.is_general)).toHaveLength(2)
    process.env.SESSION_SECRET = 'test-only-session-secret-at-least-32-characters'
    const { setSessionCookie } = await import('../api/_lib/auth')
    const { default: createGame } = await import('../api/games')
    const { default: createPlay } = await import('../api/matches')
    const makeResponse = () => ({ code:200, body:{} as Record<string,unknown>, headers:{} as Record<string,string>,status(code:number){this.code=code;return this},json(body:Record<string,unknown>){this.body=body;return this},setHeader(key:string,value:string){this.headers[key]=value;return this} })
    const session = makeResponse();setSessionCookie(session as unknown as VercelResponse,userId)
    const cookies = { partyscore_session:session.headers['Set-Cookie'].split(';')[0].split('=')[1] }
    const gameResponse = makeResponse()
    const modeA=randomUUID(), modeB=randomUUID()
    await createGame({method:'POST',cookies,query:{},body:{name:'Created via API',platform:'Console',category:'Party',minPlayers:2,maxPlayers:4,modes:[{id:modeA,name:'Gran Premio',active:true},{id:modeB,name:'Sopravvivenza',active:true}]}} as unknown as VercelRequest,gameResponse as unknown as VercelResponse)
    expect(gameResponse.code).toBe(201)
    createdGameId = String(gameResponse.body.id)
    expect(gameResponse.body.modes).toEqual(expect.arrayContaining([expect.objectContaining({id:modeA,name:'Gran Premio'}),expect.objectContaining({id:modeB,name:'Sopravvivenza'})]))
    const playResponse = makeResponse()
    const playBody = {gameId:createdGameId,modeId:modeA,playedAt:'2026-01-02T12:00:00Z',duration:0,cooperative:true,teamWon:null,results:[{playerId:playerA,score:0,winner:true},{playerId:playerB,score:0,winner:true}]}
    for (const invalid of [{...playBody,modeId:'unknown'},{...playBody,gameId,modeId:modeA}]) {
      const rejected=makeResponse()
      await createPlay({method:'POST',cookies,query:{},body:invalid} as unknown as VercelRequest,rejected as unknown as VercelResponse)
      expect(rejected.code).toBe(400)
    }
    await createPlay({method:'POST',cookies,query:{},body:playBody} as unknown as VercelRequest,playResponse as unknown as VercelResponse)
    expect(playResponse.code).toBe(201)
    expect(playResponse.body.eloUpdated).toBe(true)
    const [cooperativePlay] = await sql`select p.mode_id,p.duration_minutes,p.team_won,p.source,p.is_cooperative,s.winner from public.plays p join public.play_scores s on s.play_id=p.id where p.id=${String(playResponse.body.id)}`
    expect(cooperativePlay).toMatchObject({mode_id:modeA,duration_minutes:null,team_won:null,source:'offline',is_cooperative:false,winner:true})
    const secondPlayResponse=makeResponse()
    await createPlay({method:'POST',cookies,query:{},body:{...playBody,modeId:modeB,playedAt:'2026-01-03T12:00:00Z',cooperative:false,results:[{playerId:playerA,score:10,winner:true},{playerId:playerB,score:0,winner:false}]}} as unknown as VercelRequest,secondPlayResponse as unknown as VercelResponse)
    expect(secondPlayResponse.code).toBe(201)
    const modeRatings=await sql`select mode_id,rating,games_played from public.player_mode_ratings where game_id=${createdGameId} and player_id=${playerA}`
    expect(modeRatings).toEqual(expect.arrayContaining([expect.objectContaining({mode_id:modeA,games_played:1}),expect.objectContaining({mode_id:modeB,rating:1024,games_played:1})]))
    expect(await sql`select play_id from public.mode_elo_history where game_id=${createdGameId}`).toHaveLength(4)
    const archived=makeResponse()
    const updateBody={...gameResponse.body,minPlayers:2,maxPlayers:4,modes:[{id:modeA,name:'Gran Premio',active:false},{id:modeB,name:'Sopravvivenza',active:true}]}
    for (const invalidModes of [[{id:modeA,name:'Gran Premio',active:true},{id:modeB,name:'gran premio',active:true}]]) {
      const failedUpdate=makeResponse()
      await createGame({method:'PATCH',cookies,query:{},body:{...updateBody,modes:invalidModes}} as unknown as VercelRequest,failedUpdate as unknown as VercelResponse)
      expect(failedUpdate.code).toBe(400)
    }
    await createGame({method:'PATCH',cookies,query:{},body:updateBody} as unknown as VercelRequest,archived as unknown as VercelResponse)
    expect(archived.code).toBe(200)
    const rejected=makeResponse()
    await createPlay({method:'POST',cookies,query:{},body:playBody} as unknown as VercelRequest,rejected as unknown as VercelResponse)
    expect(rejected.code).toBe(400)
    const {default:publicData}=await import('../api/data')
    const dataResponse=makeResponse()
    await publicData({method:'GET'} as VercelRequest,dataResponse as unknown as VercelResponse)
    expect((dataResponse.body.matches as {id:string;modeId:string}[]).find(play=>play.id===playResponse.body.id)?.modeId).toBe(modeA)
    expect((dataResponse.body.games as {id:string;modes:{id:string;active:boolean}[]}[]).find(game=>game.id===createdGameId)?.modes).toEqual(expect.arrayContaining([expect.objectContaining({id:modeA,active:false})]))
    // The composite foreign key must reject a mode from another game, even outside the API.
    await expect(sql`insert into public.plays (user_id,game_id,mode_id,played_at) values (${userId},${gameId},${modeB},now())`).rejects.toThrow()
    const callPlay = async (body: unknown) => {
      const output=makeResponse()
      await createPlay({method:'PATCH',cookies,query:{},body} as unknown as VercelRequest,output as unknown as VercelResponse)
      return output
    }
    // Legacy edits preserve missing mode, exact timestamp, owner and creation time.
    const [original] = await sql`select user_id,created_at,played_at,source from public.plays where id=${playId}`
    const legacyEdit = {id:playId,gameId,modeId:null,playedAt:original.played_at,duration:35,notes:'Updated legacy play',results:[{playerId:playerA,score:0,winner:false},{playerId:playerB,score:9,winner:true}]}
    expect((await callPlay(legacyEdit)).code).toBe(200)
    const [afterLegacy] = await sql`select user_id,created_at,played_at,source,mode_id from public.plays where id=${playId}`
    expect(afterLegacy).toMatchObject({...original,mode_id:null})
    expect((await sql`select rating from public.player_ratings where player_id=${playerA} and game_id=${gameId}`)[0].rating).toBe(976)
    // The current archived mode can be retained, but cannot be newly selected.
    expect((await callPlay({...playBody,id:playResponse.body.id,notes:'Retain archived mode'})).code).toBe(200)
    expect((await callPlay({...legacyEdit,gameId:createdGameId,modeId:modeB})).code).toBe(400)
    expect((await sql`select game_id from public.plays where id=${playId}`)[0].game_id).toBe(gameId)
    expect((await callPlay({...legacyEdit,id:randomUUID()})).code).toBe(404)
    expect((await callPlay({...legacyEdit,results:[legacyEdit.results[0],legacyEdit.results[0]]})).code).toBe(400)
    expect((await callPlay({...legacyEdit,results:[null,null]})).code).toBe(400)
    await sql`insert into public.players (id,user_id,name,color) values (${playerC},${userId},'Player C','#f59e0b')`
    const editedBody = {...playBody,id:playResponse.body.id,modeId:modeB,cooperative:false,playedAt:'2026-01-04T22:23:24.567Z',duration:21,location:'Test room',source:'online',notes:'Updated match',results:[{playerId:playerB,score:42,winner:true},{playerId:playerC,score:10,winner:false}]}
    const edited = await callPlay(editedBody)
    expect(edited).toMatchObject({code:200,body:{id:playResponse.body.id,eloUpdated:true}})
    const [editedPlay]=await sql`select user_id,game_id,mode_id,played_at,duration_minutes,source,notes,location from public.plays where id=${String(playResponse.body.id)}`
    expect(editedPlay).toMatchObject({user_id:userId,game_id:createdGameId,mode_id:modeB,duration_minutes:21,source:'offline',notes:'Updated match',location:'Test room'})
    expect(new Date(editedPlay.played_at).toISOString()).toBe(editedBody.playedAt)
    expect(await sql`select player_id,score,winner,position from public.play_scores where play_id=${String(playResponse.body.id)} order by position`).toEqual([{player_id:playerB,score:'42',winner:true,position:1},{player_id:playerC,score:'10',winner:false,position:2}])
    expect(await sql`select player_id from public.player_mode_ratings where mode_id=${modeA}`).toHaveLength(0)
    expect(await sql`select player_id from public.mode_elo_history where mode_id=${modeA}`).toHaveLength(0)
    // A database error halfway through replacement must restore metadata AND all scores.
    await sql`alter table public.play_scores add constraint integration_atomic_update_check check (score <> 99998) not valid`
    const errorLog=vi.spyOn(console,'error').mockImplementation(()=>{})
    try {
      const failed = await callPlay({...editedBody,notes:'Must roll back',results:[{playerId:playerB,score:1,winner:false},{playerId:playerC,score:99998,winner:true}]})
      expect(failed.code).toBe(500)
      expect((await sql`select notes from public.plays where id=${String(playResponse.body.id)}`)[0].notes).toBe('Updated match')
      expect(await sql`select player_id,score from public.play_scores where play_id=${String(playResponse.body.id)} order by position`).toEqual([{player_id:playerB,score:'42'},{player_id:playerC,score:'10'}])
    } finally { errorLog.mockRestore(); await sql`alter table public.play_scores drop constraint integration_atomic_update_check` }
    // KingScore comments are public to read and only editable by their author.
    await sql`insert into public.users (id,display_name,email,password_hash,role) values (${commenterId},'Comment test',${`${commenterId}@example.invalid`},'not-a-login','user')`
    const commenterSession=makeResponse();setSessionCookie(commenterSession as unknown as VercelResponse,commenterId)
    const commenterCookies={partyscore_session:commenterSession.headers['Set-Cookie'].split(';')[0].split('=')[1]}
    const {default:commentsApi}=await import('../api/comments')
    const callComment=async (method:string,body:unknown,authCookies:Record<string,string|undefined>={}) => {
      const output=makeResponse()
      await commentsApi({method,cookies:authCookies,query:{playId:playId},body} as unknown as VercelRequest,output as unknown as VercelResponse)
      return output
    }
    expect((await callComment('POST',{playId,content:'Anonymous'})).code).toBe(401)
    expect((await callComment('POST',{playId,content:'  '},commenterCookies)).code).toBe(400)
    const comment=await callComment('POST',{playId,content:'Test-only comment',user_id:userId},commenterCookies)
    expect(comment).toMatchObject({code:201,body:{user_id:commenterId,author_name:'Comment test',content:'Test-only comment'}})
    const commentId=comment.body.id
    expect((await callComment('PATCH',{id:commentId,content:'Not the author'},cookies)).code).toBe(403)
    expect((await callComment('DELETE',{id:commentId},cookies)).code).toBe(403)
    expect((await callComment('PATCH',{id:commentId,content:'Edited test-only comment'},commenterCookies)).body.content).toBe('Edited test-only comment')
    const readComments=await callComment('GET',{})
    expect(readComments.body.comments).toEqual(expect.arrayContaining([expect.objectContaining({id:commentId,content:'Edited test-only comment'})]))
    expect(JSON.stringify(readComments.body)).not.toMatch(/password_hash|@example.invalid/)
    const countsResponse=makeResponse()
    await commentsApi({method:'GET',query:{playIds:playId}} as unknown as VercelRequest,countsResponse as unknown as VercelResponse)
    expect(countsResponse).toMatchObject({code:200,body:{counts:{[playId]:1}}})
    const invalidCounts=makeResponse()
    await commentsApi({method:'GET',query:{playIds:Array.from({length:21},()=>playId).join(',')}} as unknown as VercelRequest,invalidCounts as unknown as VercelResponse)
    expect(invalidCounts.code).toBe(400)

    expect((await callComment('DELETE',{id:commentId},commenterCookies)).code).toBe(200)
    expect(await sql`select id from public.play_comments where id=${String(commentId)}`).toHaveLength(0)
    const optionalMode=makeResponse()
    await createPlay({method:'POST',cookies,query:{},body:{...playBody,modeId:null}} as unknown as VercelRequest,optionalMode as unknown as VercelResponse)
    expect(optionalMode.code).toBe(400)
    expect(optionalMode.body.error).toBe('Seleziona una modalità per questo gioco.')
    // Removing every saved mode must keep the plays, scores and aggregate ratings.
    const aggregateBefore=await sql`select player_id,rating,games_played from public.player_ratings where game_id=${createdGameId} order by player_id`
    const scoresBefore=await sql`select s.play_id,s.player_id,s.score,s.winner from public.play_scores s join public.plays p on p.id=s.play_id where p.game_id=${createdGameId} order by s.play_id,s.player_id`
    const allRemoved=makeResponse()
    await createGame({method:'PATCH',cookies,query:{},body:{...updateBody,modes:[]}} as unknown as VercelRequest,allRemoved as unknown as VercelResponse)
    expect(allRemoved.code).toBe(200)
    expect(allRemoved.body.modes).toEqual([])
    expect(await sql`select id from public.game_modes where game_id=${createdGameId}`).toHaveLength(0)
    expect(await sql`select id from public.plays where game_id=${createdGameId} and mode_id is not null`).toHaveLength(0)
    expect(await sql`select s.play_id,s.player_id,s.score,s.winner from public.play_scores s join public.plays p on p.id=s.play_id where p.game_id=${createdGameId} order by s.play_id,s.player_id`).toEqual(scoresBefore)
    expect(await sql`select player_id,rating,games_played from public.player_ratings where game_id=${createdGameId} order by player_id`).toEqual(aggregateBefore)
    expect(await sql`select player_id from public.player_mode_ratings where game_id=${createdGameId}`).toHaveLength(0)
    expect(await sql`select player_id from public.mode_elo_history where game_id=${createdGameId}`).toHaveLength(0)
    const withoutMode=makeResponse()
    await createPlay({method:'POST',cookies,query:{},body:{...playBody,modeId:null}} as unknown as VercelRequest,withoutMode as unknown as VercelResponse)
    expect(withoutMode.code).toBe(201)
    expect((await callPlay({...editedBody,modeId:null})).code).toBe(200)
    const noModesGame=makeResponse()
    await createGame({method:'POST',cookies,query:{},body:{name:'No modes',platform:'Console'}} as unknown as VercelRequest,noModesGame as unknown as VercelResponse)
    expect(noModesGame.code).toBe(201)
    expect(noModesGame.body.modes).toEqual([])
    await sql`delete from public.games where id=${String(noModesGame.body.id)}`
    // The database enforces IRL-only competitive plays even outside the API.
    await expect(sql`update public.plays set source='online' where id=${playId}`).rejects.toThrow()
    await expect(sql`update public.plays set is_cooperative=true where id=${playId}`).rejects.toThrow()

    // Golf orders every participant by ascending score in API writes and ELO caches.
    const golfMode = randomUUID()
    const golfGame = makeResponse()
    await createGame({method:'PATCH',cookies,query:{},body:{...updateBody,modes:[{id:golfMode,name:'Golf (9 buche)',active:true}]}} as unknown as VercelRequest,golfGame as unknown as VercelResponse)
    expect(golfGame.code).toBe(200)
    const golfPlay = makeResponse()
    await createPlay({method:'POST',cookies,query:{},body:{gameId:createdGameId,modeId:golfMode,playedAt:'2026-01-05T12:00:00Z',results:[{playerId:playerA,score:5,winner:true},{playerId:playerC,score:10,winner:false},{playerId:playerB,score:6,winner:false}]}} as unknown as VercelRequest,golfPlay as unknown as VercelResponse)
    expect(golfPlay).toMatchObject({code:201,body:{eloUpdated:true}})
    const golfId = String(golfPlay.body.id)
    expect(await sql`select player_id,position,winner from public.play_scores where play_id=${golfId} order by position`).toEqual([
      {player_id:playerA,position:1,winner:true},
      {player_id:playerB,position:2,winner:false},
      {player_id:playerC,position:3,winner:false},
    ])
    const golfRatings = await sql`select player_id,rating from public.player_mode_ratings where game_id=${createdGameId} and mode_id=${golfMode}`
    expect(golfRatings).toEqual(expect.arrayContaining([
      {player_id:playerA,rating:1024}, {player_id:playerB,rating:1000}, {player_id:playerC,rating:976},
    ]))
    await sql`update public.play_scores set position=case when player_id=${playerB} then 3 when player_id=${playerC} then 2 else 1 end where play_id=${golfId}`
    await recalculateElo()
    expect(await sql`select player_id,rating from public.player_mode_ratings where game_id=${createdGameId} and mode_id=${golfMode}`).toEqual(expect.arrayContaining(golfRatings))

  } finally {
    await sql.transaction([sql`delete from public.users where id=${commenterId}`,sql`delete from public.users where id=${userId}`,sql`delete from public.games where id=${gameId}`,sql`delete from public.games where id=${createdGameId}`])
    await recalculateElo()
  }
}, 60000)
