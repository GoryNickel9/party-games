export type Player = { id: string; name: string; color: string; initials: string; alias?: string | null; avatar_url?: string | null; account_user_id?: string | null }
export type GameMode = { id: string; name: string; active: boolean }
export type Game = { id: string; name: string; platform: string; category: string; emoji: string; accent: string; minPlayers?: number | null; maxPlayers?: number | null; imageUrl?: string | null; modes?: GameMode[] }
export type Result = { playerId: string; score: number; winner?: boolean; position?: number; draw?: boolean }
export type Match = { id: string; gameId: string; modeId?: string | null; playedAt: string; duration: number; source?: string; notes?: string | null; location?: string | null; cooperative?: boolean; teamWon?: boolean | null; results: Result[] }
export type PartyData = { players: Player[]; games: Game[]; matches: Match[] }

export const demoPlayers: Player[] = [
  { id: 'p1', name: 'Luca', color: '#b8a1ff', initials: 'LU' },
  { id: 'p2', name: 'Giulia', color: '#ff8b7b', initials: 'GI' },
  { id: 'p3', name: 'Marco', color: '#f4c75e', initials: 'MA' },
  { id: 'p4', name: 'Sara', color: '#68d9bd', initials: 'SA' },
  { id: 'p5', name: 'Ale', color: '#83a9ff', initials: 'AL' },
]

export const gameCatalog: Game[] = [
  { id: 'mk8', name: 'Mario Kart 8 Deluxe', platform: 'Nintendo Switch', category: 'Corse', emoji: '🏁', accent: '#f06450' },
  { id: 'smash', name: 'Super Smash Bros. Ultimate', platform: 'Nintendo Switch', category: 'Picchiaduro', emoji: '🥊', accent: '#9580fa' },
  { id: 'marioparty', name: 'Super Mario Party Jamboree', platform: 'Nintendo Switch', category: 'Party', emoji: '⭐', accent: '#e9aa45' },
  { id: 'overcooked', name: 'Overcooked! 2', platform: 'PlayStation 5', category: 'Co-op', emoji: '🍳', accent: '#ff826b' },
  { id: 'rocket', name: 'Rocket League', platform: 'PlayStation 5', category: 'Sport', emoji: '🚘', accent: '#5da9ee' },
  { id: 'switchsports', name: 'Nintendo Switch Sports', platform: 'Nintendo Switch', category: 'Sport', emoji: '🎳', accent: '#5cd2ab' },
  { id: 'gangbeasts', name: 'Gang Beasts', platform: 'Xbox Series X', category: 'Party', emoji: '🧸', accent: '#c5a1ed' },
  { id: 'justdance', name: 'Just Dance 2025', platform: 'PlayStation 5', category: 'Musica', emoji: '🪩', accent: '#ec71b7' },
]

for (const game of gameCatalog) game.modes = []
gameCatalog.push({ id: 'mkworld', name: 'Mario Kart World', platform: 'Nintendo Switch 2', category: 'Corse', emoji: '🏁', accent: '#f06450', maxPlayers: 4, modes: [{ id: 'mkworld:grand-prix', name: 'Gran Premio', active: true }, { id: 'mkworld:survival', name: 'Sopravvivenza', active: true }] })

const daysAgo = (days: number, hour = 20) => {
  const date = new Date()
  date.setDate(date.getDate() - days)
  date.setHours(hour, 15, 0, 0)
  return date.toISOString()
}

export const demoMatches: Match[] = [
  { id: 'm1', gameId: 'mk8', playedAt: daysAgo(0, 21), duration: 42, results: [{ playerId: 'p1', score: 68 }, { playerId: 'p2', score: 54 }, { playerId: 'p3', score: 47 }, { playerId: 'p4', score: 39 }] },
  { id: 'm2', gameId: 'smash', playedAt: daysAgo(1, 22), duration: 35, results: [{ playerId: 'p2', score: 3 }, { playerId: 'p1', score: 2 }, { playerId: 'p5', score: 1 }] },
  { id: 'm3', gameId: 'marioparty', playedAt: daysAgo(3, 20), duration: 56, results: [{ playerId: 'p4', score: 18 }, { playerId: 'p3', score: 15 }, { playerId: 'p1', score: 12 }, { playerId: 'p2', score: 10 }] },
  { id: 'm4', gameId: 'overcooked', playedAt: daysAgo(5, 21), duration: 48, results: [{ playerId: 'p1', score: 3 }, { playerId: 'p2', score: 3 }, { playerId: 'p3', score: 3 }, { playerId: 'p4', score: 3 }] },
  { id: 'm5', gameId: 'rocket', playedAt: daysAgo(8, 22), duration: 31, results: [{ playerId: 'p3', score: 5 }, { playerId: 'p1', score: 3 }, { playerId: 'p5', score: 2 }] },
  { id: 'm6', gameId: 'mk8', playedAt: daysAgo(12, 20), duration: 38, results: [{ playerId: 'p2', score: 61 }, { playerId: 'p4', score: 57 }, { playerId: 'p1', score: 42 }, { playerId: 'p5', score: 40 }] },
  { id: 'm7', gameId: 'switchsports', playedAt: daysAgo(16, 19), duration: 29, results: [{ playerId: 'p5', score: 2 }, { playerId: 'p2', score: 1 }, { playerId: 'p3', score: 1 }] },
  { id: 'm8', gameId: 'smash', playedAt: daysAgo(20, 22), duration: 44, results: [{ playerId: 'p1', score: 3 }, { playerId: 'p3', score: 2 }, { playerId: 'p2', score: 1 }] },
  { id: 'm9', gameId: 'mk8', playedAt: daysAgo(27, 21), duration: 36, results: [{ playerId: 'p4', score: 72 }, { playerId: 'p1', score: 54 }, { playerId: 'p2', score: 48 }, { playerId: 'p3', score: 41 }] },
  { id: 'm10', gameId: 'gangbeasts', playedAt: daysAgo(32, 20), duration: 26, results: [{ playerId: 'p3', score: 7 }, { playerId: 'p2', score: 5 }, { playerId: 'p4', score: 4 }, { playerId: 'p5', score: 3 }] },
]

const STORAGE_KEY = 'partyscore.v1'

export function loadPartyData(): PartyData {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as PartyData
      if (Array.isArray(parsed.players) && Array.isArray(parsed.games) && Array.isArray(parsed.matches)) return { ...parsed, games: parsed.games.map(game => ({ ...game, modes: game.modes ?? [] })) }
    }
  } catch {
    // A bad local save should not stop the demo from opening.
  }
  return { players: demoPlayers, games: gameCatalog, matches: demoMatches }
}

export function savePartyData(data: PartyData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export function makePlayer(name: string, index: number): Player {
  const colors = ['#b8a1ff', '#ff8b7b', '#f4c75e', '#68d9bd', '#83a9ff', '#eb79b9']
  return { id: crypto.randomUUID(), name, color: colors[index % colors.length], initials: name.trim().slice(0, 2).toUpperCase() }
}
