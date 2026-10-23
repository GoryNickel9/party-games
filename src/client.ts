export type Account = { id: string; display_name: string; email: string; role: 'user' | 'admin'; avatar_url?: string | null }
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || 'Richiesta non riuscita.')
  return body as T
}
export async function readImage(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) throw new Error('Scegli un’immagine JPEG, PNG o WebP di massimo 10 MB.')
  const url = URL.createObjectURL(file)
  try {
    const image = new Image(); image.src = url; await image.decode()
    const canvas = document.createElement('canvas'), scale = Math.min(1, 640 / Math.max(image.width, image.height))
    canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Impossibile elaborare l’immagine.')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const result = canvas.toDataURL('image/webp', 0.8)
    if (result.length > 500000) throw new Error('L’immagine è troppo grande. Scegli un file più piccolo.')
    return result
  } finally { URL.revokeObjectURL(url) }
}
