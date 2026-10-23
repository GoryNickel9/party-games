import { useState } from 'react'
import type { Game } from './data'

/** The adjacent game name supplies the accessible label. */
export function GameImage({ game, fallback }: { game?: Game; fallback?: React.ReactNode }) {
  const [failedSource, setFailedSource] = useState<string | null>(null)
  return game?.imageUrl && failedSource !== game.imageUrl
    ? <img className="game-thumbnail-image" src={game.imageUrl} alt="" loading="lazy" decoding="async" onError={() => setFailedSource(game.imageUrl!)} />
    : <span aria-hidden="true">{fallback ?? game?.emoji ?? '🎮'}</span>
}
