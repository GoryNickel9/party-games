import type { Game, GameMode, Match } from './data.js'

export const modeKey = (gameId: string, modeId?: string | null) => JSON.stringify([gameId, modeId ?? null])
export const modeLabel = (game: Game | undefined, modeId?: string | null) =>
  modeId ? game?.modes?.find(mode => mode.id === modeId)?.name ?? '' : ''

/** An empty list represents a game without modes. */
export function validateModes(input: unknown): GameMode[] {
  if (!Array.isArray(input) || input.length > 30) throw new Error('Inserisci da 0 a 30 modalità.')
  const modes = input.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object') throw new Error('Modalità non valida.')
    const { id, name, active } = entry as Record<string, unknown>
    if (typeof id !== 'string' || !/^[a-zA-Z0-9:_-]{1,100}$/.test(id) || typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 80 || typeof active !== 'boolean') throw new Error('Ogni modalità richiede ID, nome (2–80 caratteri) e stato valido.')
    if (id === 'all' || id === 'legacy') throw new Error('ID modalità riservato ai filtri.')
    return { id, name: name.trim(), active }
  })
  if (new Set(modes.map(mode => mode.id)).size !== modes.length || new Set(modes.map(mode => mode.name.toLocaleLowerCase('it-IT'))).size !== modes.length) throw new Error('Le modalità devono avere ID e nomi distinti.')
  return modes
}

export function filterModeMatches(matches: Match[], gameId: string, modeId: string | null | 'all') {
  return matches.filter(match => match.gameId === gameId && (modeId === 'all' || (match.modeId ?? null) === modeId))
}
