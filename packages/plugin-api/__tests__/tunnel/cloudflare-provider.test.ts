import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const mockLogger = {
	debug: jest.fn(),
	info: jest.fn(),
	warn: jest.fn(),
	error: jest.fn(),
	event: jest.fn(),
	ready: jest.fn()
}

jest.unstable_mockModule('robo.js', () => ({
	logger: {
		fork: jest.fn(() => mockLogger)
	},
	color: {
		bold: jest.fn((value: string) => value),
		blue: jest.fn((value: string) => value),
		dim: jest.fn((value: string) => value)
	},
	composeColors: jest.fn(() => (value: string) => value),
	Mode: {
		get: jest.fn(() => undefined)
	}
}))

jest.unstable_mockModule('robo.js/unstable.js', () => ({
	Nanocore: {
		update: jest.fn()
	}
}))

const { CloudflareProvider } = await import('../../src/core/tunnel/providers/cloudflare.js')

function cloudflareResponse(result: unknown, success = true) {
	return new Response(
		JSON.stringify({
			success,
			errors: success ? [] : [{ code: 10000, message: 'Authentication error' }],
			messages: [],
			result
		}),
		{ status: success ? 200 : 403 }
	)
}

describe('CloudflareProvider', () => {
	const originalTunnelId = process.env.CLOUDFLARE_TUNNEL_ID
	const originalTunnelToken = process.env.CLOUDFLARE_TUNNEL_TOKEN
	const originalCwd = process.cwd()
	let tempDir: string
	let fetchMock: jest.MockedFunction<typeof fetch>
	let dnsRecords: Array<Record<string, unknown>>

	beforeEach(() => {
		jest.clearAllMocks()
		delete process.env.CLOUDFLARE_TUNNEL_ID
		delete process.env.CLOUDFLARE_TUNNEL_TOKEN
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robo-cloudflare-provider-'))
		process.chdir(tempDir)
		dnsRecords = []

		fetchMock = jest.fn(async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
			const url = input.toString()
			const method = init?.method ?? 'GET'

			if (url.includes('/configurations/') && method === 'PUT') {
				return cloudflareResponse({ version: 1 })
			}

			if (url.includes('/dns_records?') && method === 'GET') {
				return cloudflareResponse(dnsRecords)
			}

			if (url.endsWith('/dns_records') && method === 'POST') {
				return cloudflareResponse({ id: 'dns-record-id', name: 'robo.example.com' })
			}

			if (url.includes('/dns_records/') && method === 'PATCH') {
				return cloudflareResponse({ id: 'existing-record-id', name: 'robo.example.com' })
			}

			if (url.includes('/cfd_tunnel?') && method === 'GET') {
				return cloudflareResponse([])
			}

			if (url.endsWith('/cfd_tunnel') && method === 'POST') {
				return cloudflareResponse({ id: 'new-tunnel-id', name: 'robo' })
			}

			if (url.includes('/token') && method === 'GET') {
				return cloudflareResponse('new-tunnel-token')
			}

			throw new Error(`Unexpected request: ${method} ${url}`)
		}) as unknown as jest.MockedFunction<typeof fetch>

		global.fetch = fetchMock
	})

	afterEach(() => {
		process.chdir(originalCwd)
		fs.rmSync(tempDir, { force: true, recursive: true })

		if (originalTunnelId === undefined) {
			delete process.env.CLOUDFLARE_TUNNEL_ID
		} else {
			process.env.CLOUDFLARE_TUNNEL_ID = originalTunnelId
		}

		if (originalTunnelToken === undefined) {
			delete process.env.CLOUDFLARE_TUNNEL_TOKEN
		} else {
			process.env.CLOUDFLARE_TUNNEL_TOKEN = originalTunnelToken
		}
	})

	it('reconciles tunnel config and DNS when tunnel credentials already exist', async () => {
		process.env.CLOUDFLARE_TUNNEL_ID = 'existing-tunnel-id'
		process.env.CLOUDFLARE_TUNNEL_TOKEN = 'existing-tunnel-token'

		const provider = new CloudflareProvider()
		const initialized = await provider.initialize({
			domain: 'example.com',
			apiKey: 'api-token',
			zoneId: 'zone-id',
			accountId: 'account-id',
			originUrl: 'http://localhost:5173'
		})

		expect(initialized).toBe(true)
		expect(fetchMock).toHaveBeenCalledTimes(3)
		expect(fetchMock.mock.calls[0][0].toString()).toContain(
			'/accounts/account-id/cfd_tunnel/existing-tunnel-id/configurations/'
		)
		expect(fetchMock.mock.calls[1][0].toString()).toContain('/zones/zone-id/dns_records?')
		expect(fetchMock.mock.calls[1][0].toString()).toContain('name=robo.example.com')
		expect(fetchMock.mock.calls[1][0].toString()).not.toContain('%5Bobject+Object%5D')
		expect(fetchMock.mock.calls[2][0].toString()).toContain('/zones/zone-id/dns_records')

		const dnsCreateBody = JSON.parse(fetchMock.mock.calls[2][1]?.body as string)
		expect(dnsCreateBody).toEqual({
			comment: 'Robo.js Cloudflare Tunnel Proxy',
			name: 'robo.example.com',
			proxied: true,
			content: 'existing-tunnel-id.cfargotunnel.com',
			type: 'CNAME'
		})
	})

	it('creates a persistent tunnel and configures ingress for the provided origin URL', async () => {
		const provider = new CloudflareProvider()
		const initialized = await provider.initialize({
			domain: 'example.com',
			apiKey: 'api-token',
			zoneId: 'zone-id',
			accountId: 'account-id',
			originUrl: 'http://localhost:5173'
		})

		expect(initialized).toBe(true)

		const configCall = fetchMock.mock.calls.find((call) =>
			call[0].toString().includes('/accounts/account-id/cfd_tunnel/new-tunnel-id/configurations/')
		)

		expect(configCall).toBeDefined()
		expect(JSON.parse(configCall?.[1]?.body as string)).toEqual({
			config: {
				ingress: [
					{
						hostname: 'robo.example.com',
						service: 'http://localhost:5173'
					},
					{
						service: 'http_status:404'
					}
				]
			}
		})
	})

	it('patches an existing DNS record to point at the resolved tunnel', async () => {
		dnsRecords = [
			{
				id: 'existing-record-id',
				name: 'robo.example.com',
				type: 'CNAME',
				content: 'old-tunnel-id.cfargotunnel.com'
			}
		]

		const provider = new CloudflareProvider()
		const initialized = await provider.initialize({
			domain: 'example.com',
			apiKey: 'api-token',
			zoneId: 'zone-id',
			accountId: 'account-id',
			tunnelId: 'existing-tunnel-id',
			tunnelToken: 'existing-tunnel-token',
			originUrl: 'http://localhost:5173'
		})

		expect(initialized).toBe(true)

		const dnsPatchCall = fetchMock.mock.calls.find((call) =>
			call[0].toString().includes('/zones/zone-id/dns_records/existing-record-id')
		)

		expect(dnsPatchCall).toBeDefined()
		expect(JSON.parse(dnsPatchCall?.[1]?.body as string)).toEqual({
			comment: 'Robo.js Cloudflare Tunnel Proxy',
			name: 'robo.example.com',
			proxied: true,
			content: 'existing-tunnel-id.cfargotunnel.com',
			type: 'CNAME'
		})
	})

	it('returns false without Cloudflare credentials so quick tunnel fallback can be used', async () => {
		const provider = new CloudflareProvider()
		const initialized = await provider.initialize({})

		expect(initialized).toBe(false)
		expect(fetchMock).not.toHaveBeenCalled()
	})
})
