export const MAX_PLAY_COMMENT_LENGTH = 1000
export type PlayComment = { id: string; play_id: string; user_id: string; author_name: string; author_avatar_url?: string | null; content: string; created_at: string; updated_at: string }

export function normalizePlayCommentContent(value: unknown) {
  if (typeof value !== 'string') throw new Error('Scrivi un commento valido.')
  const content = value.replace(/\r\n?/g, '\n').trim()
  if (!content || content.length > MAX_PLAY_COMMENT_LENGTH) throw new Error(`Il commento deve contenere da 1 a ${MAX_PLAY_COMMENT_LENGTH} caratteri.`)
  return content
}
