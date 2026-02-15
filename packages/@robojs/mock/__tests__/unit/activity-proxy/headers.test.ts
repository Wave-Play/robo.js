import type { IncomingMessage } from 'node:http'
import { buildUpstreamHeaders } from '../../../src/core/activity-proxy/http-proxy.js'

describe('Activity Proxy - buildUpstreamHeaders', () => {
	test('always sets Host to upstream target host (/.proxy route)', () => {
		const req = {
			rawHeaders: [
				'Host', 'sess-edo8qelsuofwrl6y.1234567890.discordsays.localhost:50002',
				'Accept', 'text/html',
				'Cookie', 'a=b'
			],
			headers: {
				host: 'sess-edo8qelsuofwrl6y.1234567890.discordsays.localhost:50002',
				cookie: 'a=b'
			}
		} as unknown as IncomingMessage

		const targetUrl = new URL('http://localhost:3000/')
		const headers = buildUpstreamHeaders(req, targetUrl, true)

		expect(headers.Host).toBe('localhost:3000')
		expect(headers['X-Forwarded-Host']).toBe('sess-edo8qelsuofwrl6y.1234567890.discordsays.localhost:50002')
		expect(headers['X-Forwarded-Proto']).toBe('http')
		expect(headers.Cookie).toBe('a=b')
	})

	test('does not forward browser Cookie headers for mapping routes', () => {
		const req = {
			rawHeaders: [
				'Host', 'sess-edo8qelsuofwrl6y.1234567890.discordsays.localhost:50002',
				'Accept', 'text/html',
				'Cookie', 'a=b'
			],
			headers: {
				host: 'sess-edo8qelsuofwrl6y.1234567890.discordsays.localhost:50002',
				cookie: 'a=b'
			}
		} as unknown as IncomingMessage

		const targetUrl = new URL('https://firestore.googleapis.com/')
		const headers = buildUpstreamHeaders(req, targetUrl, false)

		expect(headers.Host).toBe('firestore.googleapis.com')
		expect(headers['X-Forwarded-Host']).toBeUndefined()
		expect(headers.Cookie).toBeUndefined()
	})
})

