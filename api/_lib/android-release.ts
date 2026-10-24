import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream } from 'node:stream/web'
import type { VercelResponse } from '@vercel/node'

const MAX_MANIFEST_BYTES = 16384
const MAX_APK_BYTES = 150 * 1024 * 1024
const headers = () => ({ ...(process.env.ANDROID_RELEASE_GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.ANDROID_RELEASE_GITHUB_TOKEN}` } : {}), 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'PartyScore-updates' })

function assetLocation(location: string | null) {
  if (!location) throw new Error('release_redirect_missing')
  const url = new URL(location)
  if (url.protocol !== 'https:' || url.port || url.username || url.password || !['release-assets.githubusercontent.com', 'objects.githubusercontent.com'].includes(url.hostname)) throw new Error('release_redirect_invalid')
  return url.href
}

/** Credentials go only to the constructed GitHub API URL, never to a redirect. */
async function assetResponse(url: string, signal: AbortSignal) {
  const result = await fetch(url, { headers: { ...headers(), Accept: 'application/octet-stream' }, redirect: 'manual', signal })
  if (result.status !== 302) return result
  await result.body?.cancel()
  return fetch(assetLocation(result.headers.get('location')), { redirect: 'error', signal })
}

/** Shared release validation for Android updates and the authenticated web download. */
export async function androidRelease(response: VercelResponse, mode: 'update' | 'download' = 'update') {
  try {
    const repository = process.env.ANDROID_RELEASE_REPOSITORY ?? 'GoryNickel9/PartyScore-Android'
    if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) return response.status(503).json({ error: 'Repository aggiornamenti non valido.' })
    const github = `https://api.github.com/repos/${repository}`
    const signal = AbortSignal.timeout(15000)
    const repositoryResponse = await fetch(github, { headers: headers(), signal })
    if (!repositoryResponse.ok) throw new Error('release_repository_unavailable')
    const repositoryMetadata = await repositoryResponse.json() as { private: boolean }
    if (typeof repositoryMetadata.private !== 'boolean') throw new Error('release_repository_invalid')
    if (repositoryMetadata.private && !process.env.ANDROID_RELEASE_GITHUB_TOKEN) return response.status(503).json({ error: 'Configura il token GitHub del repository Android sul server.' })
    const releaseResponse = await fetch(`${github}/releases/latest`, { headers: headers(), signal })
    if (releaseResponse.status === 404) return mode === 'update' ? response.status(204).end() : response.status(404).json({ error: 'Nessuna versione Android disponibile.' })
    if (!releaseResponse.ok) throw new Error('release_lookup_failed')
    const release = await releaseResponse.json() as { assets: { id: number; name: string; size: number }[] }
    const manifest = release.assets.find(a => a.name === 'update.json')
    const apk = release.assets.find(a => a.name === 'PartyScore.apk')
    for (const [asset, limit] of [[manifest, MAX_MANIFEST_BYTES], [apk, MAX_APK_BYTES]] as const) {
      if (!asset || !Number.isSafeInteger(asset.id) || asset.id < 1 || !Number.isSafeInteger(asset.size) || asset.size < 1 || asset.size > limit) throw new Error('release_assets_invalid')
    }
    if (!manifest || !apk) throw new Error('release_assets_missing')
    const manifestResponse = await assetResponse(`${github}/releases/assets/${manifest.id}`, signal)
    if (!manifestResponse.ok || !manifestResponse.body) throw new Error('release_manifest_failed')
    const reader = manifestResponse.body.getReader()
    const chunks: Uint8Array[] = []
    let manifestBytes = 0
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        manifestBytes += value.byteLength
        if (manifestBytes > MAX_MANIFEST_BYTES) throw new Error('release_manifest_too_large')
        chunks.push(value)
      }
    } finally { await reader.cancel() }
    const metadata = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { versionCode: number; versionName: string; sha256: string; size: number }
    if (!Number.isSafeInteger(metadata.versionCode) || metadata.versionCode < 1 || metadata.versionCode > 2147483647 || typeof metadata.versionName !== 'string' || !metadata.versionName.trim() || metadata.versionName.length > 80 || typeof metadata.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(metadata.sha256) || metadata.size !== apk.size) throw new Error('release_manifest_invalid')

    const apkUrl = `${github}/releases/assets/${apk.id}`
    if (mode === 'update') {
      // Existing Android clients accept a temporary GitHub URL and verify size/hash locally.
      const download = await fetch(apkUrl, { headers: { ...headers(), Accept: 'application/octet-stream' }, redirect: 'manual', signal })
      await download.body?.cancel()
      if (download.status !== 302) throw new Error('release_redirect_missing')
      return response.status(200).json({ version: 1, versionCode: metadata.versionCode, versionName: metadata.versionName, sha256: metadata.sha256, size: metadata.size, downloadUrl: assetLocation(download.headers.get('location')) })
    }

    const download = await assetResponse(apkUrl, AbortSignal.timeout(120000))
    if (!download.ok || !download.body) throw new Error('release_download_failed')
    response.setHeader('Content-Type', 'application/vnd.android.package-archive')
    response.setHeader('Content-Disposition', 'attachment; filename="PartyScore.apk"')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    const source = Readable.fromWeb(download.body as ReadableStream)
    const cancelDownload = () => {
      if (!response.writableFinished) source.destroy(new Error('release_client_disconnected'))
    }
    response.once('close', cancelDownload)
    const hash = createHash('sha256')
    async function* verifiedApk() {
      let bytes = 0
      for await (const chunk of source) {
        bytes += chunk.length
        if (bytes > metadata.size) throw new Error('release_download_too_large')
        hash.update(chunk)
        yield chunk
      }
      // A corrupt/truncated transfer must fail instead of ending as a successful download.
      if (bytes !== metadata.size || hash.digest('hex') !== metadata.sha256) throw new Error('release_download_integrity_failed')
    }
    try { await pipeline(Readable.from(verifiedApk()), response) }
    finally { response.off('close', cancelDownload); source.destroy() }
  } catch {
    if (response.headersSent || response.destroyed) { response.destroy(); return }
    return response.status(502).json({ error: mode === 'download' ? 'Download Android non riuscito. Riprova.' : 'Controllo aggiornamenti non riuscito. Riprova.' })
  }
}
