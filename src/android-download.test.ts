import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ user: vi.fn() }))
vi.mock('../api/_lib/auth.js', () => ({
  authenticatedUser: mocks.user,
  requireMethod: (request: VercelRequest, response: VercelResponse, method: string) => {
    if (request.method === method) return true
    response.setHeader('Allow', method)
    response.status(405).json({ error: 'Metodo non consentito.' }); return false
  },
}))
vi.mock('../api/data.js', () => ({ readPartyData: vi.fn() }))
import handler from '../api/mobile'

const nativeFetch = globalThis.fetch
const servers: Server[] = []
const apk = Buffer.from('test-apk-binary')
const manifest = { versionCode: 3, versionName: '1.0.2', sha256: createHash('sha256').update(apk).digest('hex'), size: apk.length }
const release = { assets: [{ id: 1, name: 'update.json', size: 180 }, { id: 2, name: 'PartyScore.apk', size: apk.length }] }
const assetUrl = 'https://release-assets.githubusercontent.com/asset?signature=temporary'

function github(privateRepo = true) {
  return vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ private: privateRepo })))
    .mockResolvedValueOnce(new Response(JSON.stringify(release)))
    .mockResolvedValueOnce(new Response(JSON.stringify(manifest)))
}

async function request(method = 'GET') {
  const server = createServer((req, res) => {
    const response = Object.assign(res, {
      status(code: number) { res.statusCode = code; return response },
      json(body: unknown) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); return response },
    })
    void handler(Object.assign(req, { query: { resource: 'download' }, cookies: {}, body: undefined }) as VercelRequest, response as unknown as VercelResponse)
  })
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as { port: number }
  return nativeFetch(`http://127.0.0.1:${address.port}/api/download`, { method })
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.user.mockResolvedValue({ id: 'user', role: 'user' })
  vi.stubEnv('ANDROID_RELEASE_GITHUB_TOKEN', 'server-only-token')
})
afterEach(async () => {
  vi.unstubAllGlobals(); vi.unstubAllEnvs()
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()) })))
})

describe('authenticated Android APK download', () => {
  it('rejects missing/expired sessions and writes before contacting GitHub', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    mocks.user.mockResolvedValue(null)
    const anonymous = await request()
    expect(anonymous.status).toBe(401)
    expect(anonymous.headers.get('cache-control')).toBe('private, no-store')
    expect((await request('POST')).status).toBe(405)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it.each([true, false])('streams a private=%s repository APK for an ordinary user', async privateRepo => {
    if (!privateRepo) vi.stubEnv('ANDROID_RELEASE_GITHUB_TOKEN', '')
    const fetcher = github(privateRepo).mockResolvedValueOnce(new Response(apk))
    vi.stubGlobal('fetch', fetcher)
    const result = await request()
    expect(result.status).toBe(200)
    expect(result.headers.get('content-type')).toBe('application/vnd.android.package-archive')
    expect(result.headers.get('content-disposition')).toBe('attachment; filename="PartyScore.apk"')
    expect(result.headers.get('cache-control')).toBe('private, no-store')
    expect(result.headers.get('x-content-type-options')).toBe('nosniff')
    expect(Buffer.from(await result.arrayBuffer())).toEqual(apk)
    for (const [url, options] of fetcher.mock.calls) {
      expect(url).toMatch(/^https:\/\/api\.github\.com\/repos\/GoryNickel9\/PartyScore-Android(?:$|\/)/)
      expect(options.headers.Authorization).toBe(privateRepo ? 'Bearer server-only-token' : undefined)
    }
  })

  it('follows approved manifest/APK redirects without forwarding credentials', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response('{"private":true}'))
      .mockResolvedValueOnce(new Response(JSON.stringify(release)))
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: assetUrl } }))
      .mockResolvedValueOnce(new Response(JSON.stringify(manifest)))
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: assetUrl } }))
      .mockResolvedValueOnce(new Response(apk))
    vi.stubGlobal('fetch', fetcher)
    expect(Buffer.from(await (await request()).arrayBuffer())).toEqual(apk)
    for (const index of [3, 5]) {
      expect(fetcher.mock.calls[index]).toEqual([assetUrl, expect.objectContaining({ redirect: 'error' })])
      expect(fetcher.mock.calls[index][1].headers).toBeUndefined()
    }
  })

  it.each(['https://attacker.example/app.apk', 'http://release-assets.githubusercontent.com/app.apk', 'https://user:password@release-assets.githubusercontent.com/app.apk', 'https://release-assets.githubusercontent.com:444/app.apk'])('rejects an unsafe redirect: %s', async location => {
    const fetcher = github().mockResolvedValueOnce(new Response(null, { status: 302, headers: { location } }))
    vi.stubGlobal('fetch', fetcher)
    const result = await request()
    expect(result.status).toBe(502)
    expect(JSON.stringify(await result.json())).not.toContain('server-only-token')
    expect(fetcher).toHaveBeenCalledTimes(4)
  })

  it('returns 404 without a stable release and 502 when GitHub access fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('{"private":true}')).mockResolvedValueOnce(new Response(null, { status: 404 })))
    expect((await request()).status).toBe(404)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(null, { status: 401 })))
    expect((await request()).status).toBe(502)
  })

  it('cancels the upstream APK stream when the browser disconnects', async () => {
    let cancelled!: () => void
    const cancellation = new Promise<void>(resolve => { cancelled = resolve })
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(apk.subarray(0, 1)) },
      cancel() { cancelled() },
    })
    vi.stubGlobal('fetch', github().mockResolvedValueOnce(new Response(body)))
    const result = await request()
    const reader = result.body!.getReader()
    await reader.read()
    await reader.cancel()
    await cancellation
  })

  it.each([0, -1, 1.5, 'https://attacker.example'])('rejects invalid GitHub asset IDs: %s', async id => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response('{"private":true}'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ assets: [release.assets[0], { ...release.assets[1], id }] })))
    vi.stubGlobal('fetch', fetcher)
    expect((await request()).status).toBe(502)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it.each(['size', 'sha256', 'oversize'])('aborts APK transfers with invalid %s', async failure => {
    const bytes = failure === 'size' ? apk.subarray(0, 3) : failure === 'oversize' ? Buffer.concat([apk, apk]) : Buffer.from('x'.repeat(apk.length))
    vi.stubGlobal('fetch', github().mockResolvedValueOnce(new Response(bytes)))
    await expect(request().then(response => response.arrayBuffer())).rejects.toThrow()
  })

  it('rejects oversized manifests even when release metadata understates their size', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response('{"private":true}'))
      .mockResolvedValueOnce(new Response(JSON.stringify(release)))
      .mockResolvedValueOnce(new Response(' '.repeat(16385)))
    vi.stubGlobal('fetch', fetcher)
    expect((await request()).status).toBe(502)
    expect(fetcher).toHaveBeenCalledTimes(3)
  })
})
