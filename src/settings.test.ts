import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'
const fixture = vi.hoisted(() => ({ ownerId:'11111111-1111-4111-8111-111111111111',queries:[] as { query:string; values:unknown[] }[] }))
vi.mock('../api/_lib/auth.js', () => ({
  authenticatedUser: vi.fn(async () => ({ id:fixture.ownerId,display_name:'User',email:'user@example.com',role:'user',session_version:0 })),
  verifyPassword: vi.fn((password: string) => password === 'correct-password'),hashPassword: vi.fn(() => 'hashed-password'),setSessionCookie: vi.fn(),
}))
vi.mock('../api/_lib/db.js', () => {
  const sql = Object.assign(vi.fn(async (parts: TemplateStringsArray,...values:unknown[]) => {
    const query=parts.join('?');fixture.queries.push({query,values})
    if (query.includes('select password_hash')) return [{password_hash:'stored-hash'}]
    if (query.includes('select id, display_name')) return [{id:fixture.ownerId,display_name:'Updated',email:'user@example.com',role:'user'}]
    return []
  }),{transaction:vi.fn(async (queries:Promise<unknown>[]) => Promise.all(queries))})
  return {sql}
})
import settings from '../api/settings'
function response() { return {code:200,body:null as unknown, status(code:number){this.code=code;return this},json(body:unknown){this.body=body;return this},setHeader:vi.fn()} }
async function call(body:unknown) {const out=response();await settings({method:'PATCH',body,cookies:{},query:{}} as unknown as VercelRequest,out as unknown as VercelResponse);return out}
beforeEach(() => {fixture.queries=[]})
describe('ordinary user settings', () => {
  it('updates only the authenticated profile even if another id is supplied',async () => {
    const out=await call({action:'profile',id:'other-account',displayName:'Updated',avatarUrl:''})
    expect(out.code).toBe(200)
    const updates=fixture.queries.filter(item => item.query.startsWith('update'))
    expect(updates).toHaveLength(2)
    expect(updates.every(item => item.values.at(-1)===fixture.ownerId)).toBe(true)
  })
  it('rejects email changes without the current password',async () => {
    const out=await call({action:'email',email:'new@example.com',currentPassword:'wrong'})
    expect(out.code).toBe(400)
    expect(fixture.queries.some(item => item.query.startsWith('update'))).toBe(false)
  })
  it('accepts a password change by a standard user and invalidates old sessions',async () => {
    const out=await call({action:'password',currentPassword:'correct-password',newPassword:'new-password-123'})
    expect(out.code).toBe(200)
    expect(fixture.queries.some(item => item.query.includes('session_version=session_version+1'))).toBe(true)
  })
})
