export const ADMIN_EMAIL = 'lucabaldino10@proton.me'
export function isAdmin(user: { role?: unknown } | null | undefined) { return user?.role === 'admin' }
export function canDeletePlay(user: { id: string; role?: unknown }, ownerId: string) { return isAdmin(user) || user.id === ownerId }
export function validImage(value: unknown): string | null {
  if (value == null || value === '') return null
  const image = String(value)
  if (image.length > 500000) throw new Error('L’immagine deve essere inferiore a 350 KB.')
  if (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(image)) return image
  const url = new URL(image)
  if (url.protocol !== 'https:') throw new Error('Usa un URL immagine HTTPS.')
  return url.href
}
