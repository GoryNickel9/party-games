import { describe, expect, it } from 'vitest'
import { isAdmin, validImage } from '../api/_lib/permissions'
describe('permissions and covers', () => {
  it('permits only the persisted admin role', () => {
    expect(isAdmin(null)).toBe(false)
    expect(isAdmin({ role: 'user' })).toBe(false)
    expect(isAdmin({ role: 'admin' })).toBe(true)
  })
  it('accepts HTTPS and supported inline images', () => {
    expect(validImage('https://example.com/cover.png')).toBe('https://example.com/cover.png')
    expect(validImage('data:image/webp;base64,AAAA')).toBe('data:image/webp;base64,AAAA')
    expect(validImage('')).toBeNull()
  })
  it('rejects scripts, SVG and oversized data', () => {
    for (const value of ['javascript:alert(1)', 'http://example.com/a.jpg', 'data:image/svg+xml;base64,AAAA', 'data:image/png;base64,' + 'A'.repeat(500000)]) expect(() => validImage(value)).toThrow()
  })
})
