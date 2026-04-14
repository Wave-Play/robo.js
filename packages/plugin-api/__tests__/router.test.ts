import { describe, expect, it } from '@jest/globals'
import { Router } from '../src/core/router.js'

describe('Router', () => {
	describe('basic CRUD', () => {
		it('adds a route and finds it', () => {
			const router = new Router()
			const handler = () => 'handler1'
			router.addRoute({ path: '/foo', handler })

			const result = router.find('/foo')
			expect(result).not.toBeNull()
			expect(result.handler).toBe(handler)
			expect(result.path).toBe('/foo')
		})

		it('returns null for unregistered path', () => {
			const router = new Router()
			expect(router.find('/nonexistent')).toBeNull()
		})

		it('removes a route and returns true', () => {
			const router = new Router()
			router.addRoute({ path: '/foo', handler: () => 'h' })

			expect(router.removeRoute('/foo')).toBe(true)
			expect(router.find('/foo')).toBeNull()
		})

		it('returns false when removing non-existent route', () => {
			const router = new Router()
			expect(router.removeRoute('/nonexistent')).toBe(false)
		})

		it('hasRoute returns true for registered path', () => {
			const router = new Router()
			router.addRoute({ path: '/foo', handler: () => 'h' })
			expect(router.hasRoute('/foo')).toBe(true)
		})

		it('hasRoute returns false for unregistered path', () => {
			const router = new Router()
			expect(router.hasRoute('/foo')).toBe(false)
		})

		it('hasRoute returns false after removal', () => {
			const router = new Router()
			router.addRoute({ path: '/foo', handler: () => 'h' })
			router.removeRoute('/foo')
			expect(router.hasRoute('/foo')).toBe(false)
		})
	})

	describe('query string stripping', () => {
		it('strips query string before lookup', () => {
			const router = new Router()
			const handler = () => 'h'
			router.addRoute({ path: '/foo', handler })

			const result = router.find('/foo?bar=baz')
			expect(result).not.toBeNull()
			expect(result.handler).toBe(handler)
		})
	})

	describe('query parsing', () => {
		it('parses single values', () => {
			const router = new Router()
			router.addRoute({ path: '/foo', handler: () => 'h' })

			const result = router.find('/foo?a=1&b=2')
			expect(result.query).toEqual({ a: '1', b: '2' })
		})

		it('parses comma-separated values as arrays', () => {
			const router = new Router()
			router.addRoute({ path: '/foo', handler: () => 'h' })

			const result = router.find('/foo?tags=a,b,c')
			expect(result.query).toEqual({ tags: ['a', 'b', 'c'] })
		})

		it('decodes URI-encoded values', () => {
			const router = new Router()
			router.addRoute({ path: '/foo', handler: () => 'h' })

			const result = router.find('/foo?q=hello%20world')
			expect(result.query).toEqual({ q: 'hello world' })
		})

		it('keeps single comma-less value as string', () => {
			const router = new Router()
			router.addRoute({ path: '/foo', handler: () => 'h' })

			const result = router.find('/foo?a=hello')
			expect(result.query).toEqual({ a: 'hello' })
			expect(typeof result.query.a).toBe('string')
		})

		it('returns empty query object when no query string', () => {
			const router = new Router()
			router.addRoute({ path: '/foo', handler: () => 'h' })

			const result = router.find('/foo')
			expect(result.query).toEqual({})
		})
	})

	describe('dynamic params', () => {
		it('returns params for dynamic route', () => {
			const router = new Router()
			const handler = () => 'user'
			router.addRoute({ path: '/users/:id', handler })

			const result = router.find('/users/42')
			expect(result).not.toBeNull()
			expect(result.params).toEqual({ id: '42' })
			expect(result.handler).toBe(handler)
		})

		it('returns params for multi-segment dynamic route', () => {
			const router = new Router()
			router.addRoute({ path: '/orgs/:org/repos/:repo', handler: () => 'repo' })

			const result = router.find('/orgs/acme/repos/widget')
			expect(result.params).toEqual({ org: 'acme', repo: 'widget' })
		})
	})

	describe('stats', () => {
		it('returns correct stats for empty router', () => {
			const router = new Router()
			const stats = router.stats()

			expect(stats.key).toBe('radix-router')
			expect(stats.numRoutes).toBe(0)
			expect(stats.routes).toEqual([])
		})

		it('returns correct count and route list', () => {
			const router = new Router()
			const h1 = () => 'h1'
			const h2 = () => 'h2'
			router.addRoute({ path: '/foo', handler: h1 })
			router.addRoute({ path: '/bar', handler: h2 })

			const stats = router.stats()
			expect(stats.key).toBe('radix-router')
			expect(stats.numRoutes).toBe(2)
			expect(stats.routes).toHaveLength(2)
			expect(stats.routes[0]).toEqual({ path: '/foo', handler: h1 })
			expect(stats.routes[1]).toEqual({ path: '/bar', handler: h2 })
		})

		it('decrements count after removal', () => {
			const router = new Router()
			router.addRoute({ path: '/foo', handler: () => 'h' })
			router.addRoute({ path: '/bar', handler: () => 'h' })
			router.removeRoute('/foo')

			expect(router.stats().numRoutes).toBe(1)
		})
	})

	describe('replace', () => {
		it('replaces handler when adding same path', () => {
			const router = new Router()
			const h1 = () => 'first'
			const h2 = () => 'second'

			router.addRoute({ path: '/foo', handler: h1 })
			router.addRoute({ path: '/foo', handler: h2 })

			const result = router.find('/foo')
			expect(result.handler).toBe(h2)
		})

		it('does not increase route count on replace', () => {
			const router = new Router()
			router.addRoute({ path: '/foo', handler: () => 'first' })
			router.addRoute({ path: '/foo', handler: () => 'second' })

			expect(router.stats().numRoutes).toBe(1)
		})
	})
})
