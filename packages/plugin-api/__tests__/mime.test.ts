import { describe, expect, it } from '@jest/globals'
import { types, mimeDb } from '../src/core/mime.js'

describe('mime', () => {
	describe('mimeDb extension lookups', () => {
		it('maps html to text/html', () => {
			expect(mimeDb['html']).toBe('text/html')
		})

		it('maps js to text/javascript', () => {
			expect(mimeDb['js']).toBe('text/javascript')
		})

		it('maps json to application/json', () => {
			expect(mimeDb['json']).toBe('application/json')
		})

		it('maps css to text/css', () => {
			expect(mimeDb['css']).toBe('text/css')
		})

		it('maps png to image/png', () => {
			expect(mimeDb['png']).toBe('image/png')
		})

		it('maps svg to image/svg+xml', () => {
			expect(mimeDb['svg']).toBe('image/svg+xml')
		})

		it('maps wasm to application/wasm', () => {
			expect(mimeDb['wasm']).toBe('application/wasm')
		})

		it('maps woff2 to font/woff2', () => {
			expect(mimeDb['woff2']).toBe('font/woff2')
		})

		it('maps pdf to application/pdf', () => {
			expect(mimeDb['pdf']).toBe('application/pdf')
		})

		it('maps mp4 to application/mp4 (non-starred entry)', () => {
			expect(mimeDb['mp4']).toBe('application/mp4')
		})

		it('maps *mp4 to video/mp4 (starred entry)', () => {
			expect(mimeDb['*mp4']).toBe('video/mp4')
		})

		it('maps gif to image/gif', () => {
			expect(mimeDb['gif']).toBe('image/gif')
		})

		it('maps webp to image/webp', () => {
			expect(mimeDb['webp']).toBe('image/webp')
		})
	})

	describe('unknown extensions', () => {
		it('returns undefined for unknown extension', () => {
			expect(mimeDb['xyz123']).toBeUndefined()
		})
	})

	describe('frozen objects', () => {
		it('types is frozen', () => {
			expect(Object.isFrozen(types)).toBe(true)
		})

		it('mimeDb is frozen', () => {
			expect(Object.isFrozen(mimeDb)).toBe(true)
		})
	})

	describe('types structure', () => {
		it('has keys that are MIME type strings', () => {
			const keys = Object.keys(types)
			expect(keys.length).toBeGreaterThan(0)

			// All keys should look like MIME types (type/subtype)
			for (const key of keys) {
				expect(key).toMatch(/^[a-z]+\//)
			}
		})

		it('has values that are arrays of strings', () => {
			for (const [mimeType, extensions] of Object.entries(types)) {
				expect(Array.isArray(extensions)).toBe(true)
				expect(extensions.length).toBeGreaterThan(0)
				for (const ext of extensions) {
					expect(typeof ext).toBe('string')
				}
			}
		})

		it('contains expected MIME types', () => {
			expect(types['text/html']).toBeDefined()
			expect(types['application/json']).toBeDefined()
			expect(types['image/png']).toBeDefined()
			expect(types['text/css']).toBeDefined()
		})
	})
})
