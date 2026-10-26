import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'
const mocks = vi.hoisted(() => ({ user: vi.fn(), data: vi.fn(), linked: vi.fn() }))
vi.mock('../api/_lib/auth', () => ({ authenticatedUser: mocks.user, requireMethod: (request: VercelRequest, response: VercelResponse, method: string) => {
  if (request.method === method) return true
  response.status(405).json({ error: 'Metodo non consentito.' }); return false
} }))
vi.mock('../api/data', () => ({ readPartyData: mocks.data, readLinkedPlayer: mocks.linked }))
import handler from '../api/mobile'

const response = () => ({ code: 200, body: undefined as unknown, setHeader: vi.fn(), status(code: number) { this.code = code; return this }, json(body: unknown) { this.body = body; return this }, end() { return this } })
async function call(query: Record<string, unknown>, method = 'GET') {
  const res = response()
  await handler({ method, query } as unknown as VercelRequest, res as unknown as VercelResponse)
  return res
}
beforeEach(() => { vi.resetAllMocks(); mocks.user.mockResolvedValue({ id: 'user' }); mocks.linked.mockResolvedValue(null); mocks.data.mockResolvedValue({ players: [], games: [], matches: [] }) })
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('authenticated mobile API', () => {
  it('restricts personal Wrapped by the server-side account link, including forged requests', async () => {
    mocks.data.mockResolvedValue({ players: [{ id: 'mine', name: 'Io' }, { id: 'other', name: 'Altro' }], games: [], matches: [] })
    mocks.linked.mockResolvedValue('mine')
    expect((await call({ resource: 'wrapped', year: '2026', player: 'other' })).code).toBe(403)
    const mine = await call({ resource: 'wrapped', year: '2026', player: 'mine' })
    expect(mine.code).toBe(200)
    expect(mine.body).toMatchObject({ personalId: 'mine', playerId: 'mine', players: [{ id: 'mine', name: 'Io' }] })
    expect(mocks.linked).toHaveBeenCalledWith('user')
    expect((await call({ resource: 'wrapped', year: '2026' })).code).toBe(200)
    mocks.linked.mockResolvedValue(null)
    expect((await call({ resource: 'wrapped', player: 'mine' })).code).toBe(403)
    expect((await call({ resource: 'wrapped' })).body).toMatchObject({ personalId: null, players: [] })
    mocks.user.mockResolvedValue({ id: 'admin', role: 'admin' })
    expect((await call({ resource: 'wrapped', player: 'other' })).code).toBe(200)
    expect((await call({ resource: 'wrapped', player: 'missing' })).code).toBe(403)
  })
  it('rejects anonymous reads before touching data or GitHub', async () => {
    mocks.user.mockResolvedValue(null)
    expect((await call({ resource: 'dashboard' })).code).toBe(401)
    expect((await call({ resource: 'update' })).code).toBe(401)
    expect(mocks.data).not.toHaveBeenCalled()
  })
  it('rejects writes and malformed filters', async () => {
    expect((await call({ resource: 'dashboard' }, 'POST')).code).toBe(405)
    for (const filters of [{ page: '-1' }, { page: 'NaN' }, { month: '13' }, { year: 'x' }, { game: ['a', 'b'] }, { search: 'a'.repeat(201) }, { extra: 'x' }]) expect((await call({ resource: 'matches', ...filters })).code).toBe(400)
    expect(mocks.data).not.toHaveBeenCalled()
  })
  it('versions responses and rejects unknown games or modes', async () => {
    const res = await call({ resource: 'dashboard' })
    expect(res.code).toBe(200)
    expect(res.body).toMatchObject({ version: 1, totalMatches: 0 })
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store')
    expect((await call({ resource: 'elo', game: 'unknown' })).code).toBe(400)
    expect((await call({ resource: 'matches', mode: 'unknown' })).code).toBe(400)
  })
  it('resolves private assets through authenticated API URLs without exposing the token', async () => {
    vi.stubEnv('ANDROID_RELEASE_GITHUB_TOKEN', 'server-only-token')
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response('{"private":true}'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ assets: [{ id: 1, name: 'update.json', size: 180, browser_download_url: 'https://github.com/GoryNickel9/PartyScore-Android/releases/download/v1.1.0/update.json' }, { id: 2, name: 'PartyScore.apk', size: 1000, browser_download_url: 'https://github.com/GoryNickel9/PartyScore-Android/releases/download/v1.1.0/PartyScore.apk' }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ versionCode: 2, versionName: '1.1.0', sha256: 'a'.repeat(64), size: 1000 })))
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'https://release-assets.githubusercontent.com/asset?signature=temporary' } }))
    vi.stubGlobal('fetch', fetcher)
    const result = await call({ resource: 'update' })
    expect(result.code).toBe(200)
    expect(result.body).toMatchObject({ version: 1, versionCode: 2 })
    expect(JSON.stringify(result.body)).not.toContain('server-only-token')
    expect(mocks.data).not.toHaveBeenCalled()
    for (const [url, options] of fetcher.mock.calls) {
      expect(String(url)).toMatch(/^https:\/\/api\.github\.com\/repos\/GoryNickel9\/PartyScore-Android(?:$|\/)/)
      expect(options.headers.Authorization).toBe('Bearer server-only-token')
    }
    expect(fetcher.mock.calls[2][0]).toContain('/releases/assets/1')
    expect(fetcher.mock.calls[3][0]).toContain('/releases/assets/2')
  })
  it('rejects unsafe asset redirects', async () => {
    vi.stubEnv('ANDROID_RELEASE_GITHUB_TOKEN', 'server-only-token')
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response('{"private":false}'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ assets: [{ id: 1, name: 'update.json', size: 180, browser_download_url: 'https://github.com/GoryNickel9/PartyScore-Android/releases/download/v1.1.0/update.json' }, { id: 2, name: 'PartyScore.apk', size: 1000, browser_download_url: 'https://github.com/GoryNickel9/PartyScore-Android/releases/download/v1.1.0/PartyScore.apk' }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ versionCode: 2, versionName: '1.1.0', sha256: 'a'.repeat(64), size: 1000 })))
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'https://attacker.example/asset' } })))
    expect((await call({ resource: 'update' })).code).toBe(502)
  })
  it('distinguishes no stable release from a repository the token cannot access', async () => {
    vi.stubEnv('ANDROID_RELEASE_GITHUB_TOKEN', '')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('{"private":false}')).mockResolvedValueOnce(new Response(null, { status: 404 })))
    expect((await call({ resource: 'update' })).code).toBe(204)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(null, { status: 404 })))
    expect((await call({ resource: 'update' })).code).toBe(502)
  })
  it('requires a server token for private repositories', async () => {
    vi.stubEnv('ANDROID_RELEASE_GITHUB_TOKEN', '')
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('{"private":true}'))
    vi.stubGlobal('fetch', fetcher)
    expect((await call({ resource: 'update' })).code).toBe(503)
    expect(fetcher).toHaveBeenCalledOnce()
  })
})
