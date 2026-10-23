import { useState } from 'react'
import type { Player } from './data'

export function PlayerAvatar({ player, size = 'regular', className = '' }: { player?: Player; size?: 'small' | 'regular' | 'large'; className?: string }) {
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const source = player?.avatar_url
  return <span className={`avatar avatar-${size} ${className}`} style={{ background: player?.color ?? '#605b70' }}>
    {source && source !== failedSource ? <img src={source} alt="" loading="lazy" decoding="async" onError={() => setFailedSource(source)} /> : player?.initials ?? '??'}
  </span>
}
