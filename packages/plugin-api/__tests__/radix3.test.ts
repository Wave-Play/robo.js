import { describe, expect, it } from '@jest/globals'
import { createRouter, NODE_TYPES } from '../src/core/radix3.js'

describe('radix3', () => {
	describe('NODE_TYPES', () => {
		it('has expected constant values', () => {
			expect(NODE_TYPES.NORMAL).toBe(0)
			expect(NODE_TYPES.WILDCARD).toBe(1)
			expect(NODE_TYPES.PLACEHOLDER).toBe(2)
		})
	})

	describe('static routes', () => {
		it('inserts and looks up a static route', () => {
			const router = createRouter()
			router.insert('/foo', { value: 'bar' })
			expect(router.lookup('/foo')).toEqual({ value: 'bar' })
		})

		it('returns null for unregistered paths', () => {
			const router = createRouter()
			router.insert('/foo', { value: 'bar' })
			expect(router.lookup('/baz')).toBeNull()
		})

		it('handles multiple static routes independently', () => {
			const router = createRouter()
			router.insert('/foo', { value: 'foo' })
			router.insert('/bar', { value: 'bar' })
			router.insert('/baz/qux', { value: 'baz-qux' })

			expect(router.lookup('/foo')).toEqual({ value: 'foo' })
			expect(router.lookup('/bar')).toEqual({ value: 'bar' })
			expect(router.lookup('/baz/qux')).toEqual({ value: 'baz-qux' })
		})

		it('caches static routes in staticRoutesMap', () => {
			const router = createRouter()
			router.insert('/foo', { value: 'bar' })

			expect(router.ctx.staticRoutesMap['/foo']).toBeDefined()
			expect(router.ctx.staticRoutesMap['/foo'].data).toEqual({ value: 'bar' })
		})
	})

	describe('dynamic :param routes', () => {
		it('matches a single param segment', () => {
			const router = createRouter()
			router.insert('/users/:id', { handler: 'getUser' })

			const result = router.lookup('/users/42')
			expect(result).toEqual({ handler: 'getUser', params: { id: '42' } })
		})

		it('matches multiple param segments', () => {
			const router = createRouter()
			router.insert('/a/:x/b/:y', { handler: 'multi' })

			const result = router.lookup('/a/hello/b/world')
			expect(result).toEqual({ handler: 'multi', params: { x: 'hello', y: 'world' } })
		})

		it('does not cache dynamic routes in staticRoutesMap', () => {
			const router = createRouter()
			router.insert('/users/:id', { handler: 'getUser' })

			expect(router.ctx.staticRoutesMap['/users/:id']).toBeUndefined()
		})
	})

	describe('wildcard ** routes', () => {
		it('matches named wildcard and captures rest of path', () => {
			const router = createRouter()
			router.insert('/files/**:path', { handler: 'files' })

			const result = router.lookup('/files/a/b/c')
			expect(result).toEqual({ handler: 'files', params: { path: 'a/b/c' } })
		})

		it('uses _ as param name for unnamed wildcard', () => {
			const router = createRouter()
			router.insert('/**', { handler: 'catchAll' })

			const result = router.lookup('/anything/here')
			expect(result).toEqual({ handler: 'catchAll', params: { _: 'anything/here' } })
		})
	})

	describe('priority', () => {
		it('prefers exact match over placeholder over wildcard', () => {
			const router = createRouter()
			router.insert('/users/admin', { handler: 'exact' })
			router.insert('/users/:id', { handler: 'placeholder' })
			router.insert('/users/**:rest', { handler: 'wildcard' })

			expect(router.lookup('/users/admin')).toEqual({ handler: 'exact' })
			expect(router.lookup('/users/42')).toEqual({ handler: 'placeholder', params: { id: '42' } })
			expect(router.lookup('/users/42/posts/1')).toEqual({
				handler: 'wildcard',
				params: { rest: '42/posts/1' }
			})
		})
	})

	describe('removal', () => {
		it('removes existing route and returns true', () => {
			const router = createRouter()
			router.insert('/foo', { value: 'bar' })

			expect(router.remove('/foo')).toBe(true)
			expect(router.lookup('/foo')).toBeNull()
		})

		it('returns false when removing non-existent route', () => {
			const router = createRouter()
			expect(router.remove('/nonexistent')).toBe(false)
		})

		it('deletes entry from staticRoutesMap after removal', () => {
			const router = createRouter()
			router.insert('/foo', { value: 'bar' })
			expect(router.ctx.staticRoutesMap['/foo']).toBeDefined()

			router.remove('/foo')
			expect(router.ctx.staticRoutesMap['/foo']).toBeUndefined()
		})

		it('prunes leaf nodes after removal', () => {
			const router = createRouter()
			router.insert('/a/b/c', { value: 'deep' })

			router.remove('/a/b/c')
			// After pruning, the root node should have no children for 'a'
			// because there is no other data along that path
			expect(router.lookup('/a/b/c')).toBeNull()
			expect(router.lookup('/a/b')).toBeNull()
			expect(router.lookup('/a')).toBeNull()
		})

		it('lookup returns null after removal', () => {
			const router = createRouter()
			router.insert('/test', { handler: 'test' })
			router.remove('/test')
			expect(router.lookup('/test')).toBeNull()
		})
	})

	describe('trailing slash', () => {
		it('normalizes trailing slash by default', () => {
			const router = createRouter()
			router.insert('/foo', { value: 'bar' })

			expect(router.lookup('/foo/')).toEqual({ value: 'bar' })
		})

		it('treats trailing slash as different path with strictTrailingSlash', () => {
			const router = createRouter({ strictTrailingSlash: true })
			router.insert('/foo', { value: 'no-slash' })
			router.insert('/foo/', { value: 'with-slash' })

			expect(router.lookup('/foo')).toEqual({ value: 'no-slash' })
			expect(router.lookup('/foo/')).toEqual({ value: 'with-slash' })
		})
	})

	describe('edge cases', () => {
		it('handles root path /', () => {
			const router = createRouter()
			router.insert('/', { handler: 'root' })

			expect(router.lookup('/')).toEqual({ handler: 'root' })
		})

		it('handles empty path', () => {
			const router = createRouter()
			router.insert('', { handler: 'empty' })

			expect(router.lookup('')).toEqual({ handler: 'empty' })
		})

		it('duplicate insert overwrites data', () => {
			const router = createRouter()
			router.insert('/foo', { value: 'first' })
			router.insert('/foo', { value: 'second' })

			expect(router.lookup('/foo')).toEqual({ value: 'second' })
		})

		it('lookup returns null for non-matching deeper paths', () => {
			const router = createRouter()
			router.insert('/foo', { value: 'bar' })

			expect(router.lookup('/foo/bar')).toBeNull()
		})
	})

	describe('unnamed placeholder *', () => {
		it('assigns _0 as param name for unnamed placeholder', () => {
			const router = createRouter()
			router.insert('/:a/*/b', { handler: 'unnamed' })

			const result = router.lookup('/hello/world/b')
			expect(result).toEqual({ handler: 'unnamed', params: { a: 'hello', _0: 'world' } })
		})
	})

	describe('initial routes option', () => {
		it('accepts routes in constructor options', () => {
			const router = createRouter({
				routes: {
					'/foo': { value: 'foo' },
					'/bar': { value: 'bar' }
				}
			})

			expect(router.lookup('/foo')).toEqual({ value: 'foo' })
			expect(router.lookup('/bar')).toEqual({ value: 'bar' })
		})
	})
})
