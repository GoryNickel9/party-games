import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'
const fixture = vi.hoisted(() => ({ role: 'user', queries: [] as string[] }))
vi.mock('../api/_lib/db.js', () => ({ sql: vi.fn(async (parts: TemplateStringsArray) => { const query = parts.join('?'); fixture.queries.push(query); return query.includes('from public.users where id') ? [{ id:'11111111-1111-4111-8111-111111111111',display_name:'Test',email:'test@example.com',role:fixture.role,session_version:0 }] : [] }) }))
import { setSessionCookie } from '../api/_lib/auth'
import games from '../api/games'
import players from '../api/players'
import matches from '../api/matches'
import admin from '../api/admin'
import data from '../api/data'
function response() {
  const result = { code: 200, body: null as unknown, headers: {} as Record<string,string>, status(code: number) { this.code=code; return this }, json(body: unknown) { this.body=body; return this }, setHeader(key: string,value: string) { this.headers[key]=value; return this } }
  return result
}
function request(signedIn: boolean) {
  const out = response()
  if (signedIn) setSessionCookie(out as unknown as VercelResponse,'11111111-1111-4111-8111-111111111111')
  const cookie = out.headers['Set-Cookie']?.split(';')[0].split('=')[1]
  return { method:'POST',cookies: signedIn ? { partyscore_session:cookie } : {},body:{ name:'Test',gameId:'mk8' },query:{} } as unknown as VercelRequest
}
beforeEach(() => { process.env.SESSION_SECRET='test-only-session-secret-with-at-least-32-characters'; fixture.role='user';fixture.queries=[] })
describe('server-side access control', () => {
  for (const [name,handler] of Object.entries({games,players,matches,admin})) {
    it(`${name}: anonymous cannot write`,async () => { const out=response();await handler(request(false),out as unknown as VercelResponse);expect(out.code).toBe(401);expect(fixture.queries).toHaveLength(0) })
    it(`${name}: ordinary user cannot write`,async () => { const out=response();await handler(request(true),out as unknown as VercelResponse);expect(out.code).toBe(403);expect(fixture.queries.every(query => query.startsWith('select'))).toBe(true) })
  }
  it('serves safe global data to anonymous visitors',async () => {
    const out=response(), req=request(false);req.method='GET';await data(req,out as unknown as VercelResponse)
    expect(out.code).toBe(200);expect(out.body).toEqual({players:[],games:[],matches:[]})
    expect(fixture.queries.join(' ')).not.toMatch(/password_hash|\bemail\b|account_user_id|where p\.user_id/)
  })
  it('protects match editing for both anonymous visitors and ordinary users', async () => {
    for (const signedIn of [false, true]) {
      const out=response(), req=request(signedIn); req.method='PATCH'
      await matches(req,out as unknown as VercelResponse)
      expect(out.code).toBe(signedIn ? 403 : 401)
      expect(fixture.queries.every(query => query.startsWith('select'))).toBe(true)
    }
  })
})
