import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { stripTypeScriptTypes } from 'node:module'
import { pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'
import { expect, it } from 'vitest'

it('loads the shared ELO graph as native Node ESM, as deployed by Vercel', () => {
  const directory = mkdtempSync(join(tmpdir(), 'partyscore-node-'))
  try {
    mkdirSync(join(directory, 'elo'))
    writeFileSync(join(directory, 'package.json'), '{"type":"module"}')
    for (const file of ['king-elo-core', 'play-elo', 'game-rules', 'game-modes', 'elo/simulation', 'elo/mode-simulation', 'elo/positions']) {
      const source = readFileSync(new URL(`./${file}.ts`, import.meta.url), 'utf8')
      writeFileSync(join(directory, `${file}.js`), stripTypeScriptTypes(source))
    }
    const url = pathToFileURL(join(directory, 'king-elo-core.js')).href
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', `import { simulateKingElo } from ${JSON.stringify(url)}; console.log(JSON.stringify(simulateKingElo([], [], []).general))`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 })
    expect(JSON.parse(output)).toEqual({})
    const playUrl = pathToFileURL(join(directory, 'play-elo.js')).href
    const detail = execFileSync(process.execPath, ['--input-type=module', '-e', `import { getPlaysElo } from ${JSON.stringify(playUrl)}; console.log(getPlaysElo([], [], []).size)`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 })
    expect(detail.trim()).toBe('0')
  } finally { rmSync(directory, { recursive: true, force: true }) }
}, 90000)
