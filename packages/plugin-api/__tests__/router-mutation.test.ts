import { describe, expect, it, jest } from '@jest/globals'
import { createRouter } from '../src/core/radix3.js'
import { Router } from '../src/core/router.js'

describe('router mutation safety', () => {
	it('removing a parent route does not remove dynamic child routes', () => {
		const router = new Router()
		const parentHandler = jest.fn()
		const childHandler = jest.fn()

		router.addRoute({ handler: parentHandler, path: '/api/users' })
		router.addRoute({ handler: childHandler, path: '/api/users/:id' })

		expect(router.removeRoute('/api/users')).toBe(true)
		expect(router.find('/api/users')).toBeNull()
		expect(router.find('/api/users/123')?.handler).toBe(childHandler)
	})

	it('removing a dynamic child route does not remove the static parent route', () => {
		const router = new Router()
		const parentHandler = jest.fn()
		const childHandler = jest.fn()

		router.addRoute({ handler: parentHandler, path: '/api/users' })
		router.addRoute({ handler: childHandler, path: '/api/users/:id' })

		expect(router.removeRoute('/api/users/:id')).toBe(true)
		expect(router.find('/api/users/:id')).toBeNull()
		expect(router.find('/api/users')?.handler).toBe(parentHandler)
	})

	it('clears static lookup cache when removing and re-adding a static route', () => {
		const router = createRouter()
		const firstRoute = { path: '/api/users', version: 1 }
		const secondRoute = { path: '/api/users', version: 2 }

		router.insert('/api/users', firstRoute)
		expect(router.ctx.staticRoutesMap['/api/users']).toBeDefined()
		expect(router.lookup('/api/users')).toBe(firstRoute)

		expect(router.remove('/api/users')).toBe(true)
		expect(router.ctx.staticRoutesMap['/api/users']).toBeUndefined()
		expect(router.lookup('/api/users')).toBeNull()

		router.insert('/api/users', secondRoute)
		expect(router.lookup('/api/users')).toBe(secondRoute)
	})
})
