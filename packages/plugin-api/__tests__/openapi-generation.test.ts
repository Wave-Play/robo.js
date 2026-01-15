import { describe, expect, it, beforeEach, afterEach } from '@jest/globals'
import { convertRouteToOpenAPIPath, generateOpenAPISpec } from '../src/core/openapi-generator.js'
import { readFile, rm, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

describe('convertRouteToOpenAPIPath()', () => {
	it('converts single params', () => {
		expect(convertRouteToOpenAPIPath('users/[id]')).toBe('/users/{id}')
	})

	it('converts multiple params', () => {
		expect(convertRouteToOpenAPIPath('users/[userId]/posts/[postId]')).toBe('/users/{userId}/posts/{postId}')
	})

	it('converts catch-all params', () => {
		expect(convertRouteToOpenAPIPath('docs/[...slug]')).toBe('/docs/{slug}')
	})

	it('converts optional catch-all params', () => {
		expect(convertRouteToOpenAPIPath('docs/[[...slug]]')).toBe('/docs/{slug}')
	})

	it('handles plain routes', () => {
		expect(convertRouteToOpenAPIPath('users')).toBe('/users')
	})

	it('handles nested routes', () => {
		expect(convertRouteToOpenAPIPath('api/v1/users')).toBe('/api/v1/users')
	})

	it('converts params at the start of path', () => {
		expect(convertRouteToOpenAPIPath('[tenantId]/users')).toBe('/{tenantId}/users')
	})

	it('converts multiple params in sequence', () => {
		expect(convertRouteToOpenAPIPath('[org]/[repo]/[branch]')).toBe('/{org}/{repo}/{branch}')
	})

	it('handles deeply nested routes with params', () => {
		expect(convertRouteToOpenAPIPath('orgs/[orgId]/teams/[teamId]/members/[memberId]')).toBe(
			'/orgs/{orgId}/teams/{teamId}/members/{memberId}'
		)
	})

	it('handles empty route key', () => {
		expect(convertRouteToOpenAPIPath('')).toBe('/')
	})

	it('handles mixed catch-all and regular params', () => {
		expect(convertRouteToOpenAPIPath('[version]/docs/[...slug]')).toBe('/{version}/docs/{slug}')
	})
})

describe('generateOpenAPISpec()', () => {
	const testDir = path.join(__dirname, '.test-output')
	const testBuildDir = path.join(testDir, 'build')

	beforeEach(async () => {
		await mkdir(testBuildDir, { recursive: true })
	})

	afterEach(async () => {
		await rm(testDir, { recursive: true, force: true })
	})

	it('generates valid OpenAPI 3.1 spec', async () => {
		// Use the test fixture instead of dynamically creating a module
		const fixturesDir = path.join(__dirname, 'fixtures')

		const entries = [
			{
				key: 'test-route',
				path: path.relative(fixturesDir, path.join(fixturesDir, 'test-route.ts'))
			}
		]

		const outputPath = path.join(testDir, 'openapi.json')

		await generateOpenAPISpec(entries, fixturesDir, { outputPath })

		const content = await readFile(outputPath, 'utf-8')
		const spec = JSON.parse(content)

		expect(spec.openapi).toBe('3.1.0')
		expect(spec.info).toBeDefined()
		expect(spec.info.title).toBe('API')
		expect(spec.info.version).toBe('1.0.0')
		expect(spec.paths).toBeDefined()
		expect(spec.paths['/test-route']).toBeDefined()
		expect(spec.paths['/test-route'].post).toBeDefined()
		expect(spec.paths['/test-route'].post.summary).toBe('Test endpoint')
		expect(spec.paths['/test-route'].post.tags).toEqual(['test'])
	})

	it('skips generation when no entries', async () => {
		const outputPath = path.join(testDir, 'openapi.json')

		await generateOpenAPISpec([], testBuildDir, { outputPath })

		// File should not be created
		try {
			await readFile(outputPath, 'utf-8')
			throw new Error('File should not exist')
		} catch (error: any) {
			expect(error.code).toBe('ENOENT')
		}
	})

	it('accepts custom info fields', async () => {
		const entries = [] as any[]
		const outputPath = path.join(testDir, 'openapi.json')

		await generateOpenAPISpec(entries, testBuildDir, {
			outputPath,
			title: 'Custom API',
			version: '2.0.0',
			description: 'Test description',
			contact: { name: 'Test', email: 'test@example.com' },
			license: { name: 'MIT' }
		})

		// Should still not generate without entries
		try {
			await readFile(outputPath, 'utf-8')
			throw new Error('File should not exist without entries')
		} catch (error: any) {
			expect(error.code).toBe('ENOENT')
		}
	})

	it('generates spec with custom title and version', async () => {
		const fixturesDir = path.join(__dirname, 'fixtures')
		const entries = [
			{
				key: 'test-route',
				path: path.relative(fixturesDir, path.join(fixturesDir, 'test-route.ts'))
			}
		]
		const outputPath = path.join(testDir, 'openapi.json')

		await generateOpenAPISpec(entries, fixturesDir, {
			outputPath,
			title: 'My Custom API',
			version: '2.5.0',
			description: 'A custom API description'
		})

		const content = await readFile(outputPath, 'utf-8')
		const spec = JSON.parse(content)

		expect(spec.info.title).toBe('My Custom API')
		expect(spec.info.version).toBe('2.5.0')
		expect(spec.info.description).toBe('A custom API description')
	})

	it('includes servers when provided', async () => {
		const fixturesDir = path.join(__dirname, 'fixtures')
		const entries = [
			{
				key: 'test-route',
				path: path.relative(fixturesDir, path.join(fixturesDir, 'test-route.ts'))
			}
		]
		const outputPath = path.join(testDir, 'openapi.json')

		await generateOpenAPISpec(entries, fixturesDir, {
			outputPath,
			servers: [
				{ url: 'https://api.example.com', description: 'Production' },
				{ url: 'https://staging-api.example.com', description: 'Staging' }
			]
		})

		const content = await readFile(outputPath, 'utf-8')
		const spec = JSON.parse(content)

		expect(spec.servers).toHaveLength(2)
		expect(spec.servers[0].url).toBe('https://api.example.com')
		expect(spec.servers[0].description).toBe('Production')
	})

	it('includes contact information when provided', async () => {
		const fixturesDir = path.join(__dirname, 'fixtures')
		const entries = [
			{
				key: 'test-route',
				path: path.relative(fixturesDir, path.join(fixturesDir, 'test-route.ts'))
			}
		]
		const outputPath = path.join(testDir, 'openapi.json')

		await generateOpenAPISpec(entries, fixturesDir, {
			outputPath,
			contact: {
				name: 'API Support',
				email: 'support@example.com',
				url: 'https://example.com/support'
			}
		})

		const content = await readFile(outputPath, 'utf-8')
		const spec = JSON.parse(content)

		expect(spec.info.contact).toBeDefined()
		expect(spec.info.contact.name).toBe('API Support')
		expect(spec.info.contact.email).toBe('support@example.com')
	})

	it('includes license information when provided', async () => {
		const fixturesDir = path.join(__dirname, 'fixtures')
		const entries = [
			{
				key: 'test-route',
				path: path.relative(fixturesDir, path.join(fixturesDir, 'test-route.ts'))
			}
		]
		const outputPath = path.join(testDir, 'openapi.json')

		await generateOpenAPISpec(entries, fixturesDir, {
			outputPath,
			license: {
				name: 'MIT',
				identifier: 'MIT'
			}
		})

		const content = await readFile(outputPath, 'utf-8')
		const spec = JSON.parse(content)

		expect(spec.info.license).toBeDefined()
		expect(spec.info.license.name).toBe('MIT')
		expect(spec.info.license.identifier).toBe('MIT')
	})

	it('includes tags when provided', async () => {
		const fixturesDir = path.join(__dirname, 'fixtures')
		const entries = [
			{
				key: 'test-route',
				path: path.relative(fixturesDir, path.join(fixturesDir, 'test-route.ts'))
			}
		]
		const outputPath = path.join(testDir, 'openapi.json')

		await generateOpenAPISpec(entries, fixturesDir, {
			outputPath,
			tags: [
				{ name: 'Users', description: 'User management' },
				{ name: 'Auth', description: 'Authentication' }
			]
		})

		const content = await readFile(outputPath, 'utf-8')
		const spec = JSON.parse(content)

		expect(spec.tags).toHaveLength(2)
		expect(spec.tags[0].name).toBe('Users')
		expect(spec.tags[1].name).toBe('Auth')
	})

	it('includes security schemes when provided', async () => {
		const fixturesDir = path.join(__dirname, 'fixtures')
		const entries = [
			{
				key: 'test-route',
				path: path.relative(fixturesDir, path.join(fixturesDir, 'test-route.ts'))
			}
		]
		const outputPath = path.join(testDir, 'openapi.json')

		await generateOpenAPISpec(entries, fixturesDir, {
			outputPath,
			securitySchemes: {
				apiKey: {
					type: 'apiKey',
					in: 'header',
					name: 'X-API-Key'
				},
				bearerAuth: {
					type: 'http',
					scheme: 'bearer',
					bearerFormat: 'JWT'
				}
			}
		})

		const content = await readFile(outputPath, 'utf-8')
		const spec = JSON.parse(content)

		expect(spec.components).toBeDefined()
		expect(spec.components.securitySchemes).toBeDefined()
		expect(spec.components.securitySchemes.apiKey.type).toBe('apiKey')
		expect(spec.components.securitySchemes.bearerAuth.type).toBe('http')
	})

	it('generates correct operationId', async () => {
		const fixturesDir = path.join(__dirname, 'fixtures')
		const entries = [
			{
				key: 'test-route',
				path: path.relative(fixturesDir, path.join(fixturesDir, 'test-route.ts'))
			}
		]
		const outputPath = path.join(testDir, 'openapi.json')

		await generateOpenAPISpec(entries, fixturesDir, { outputPath })

		const content = await readFile(outputPath, 'utf-8')
		const spec = JSON.parse(content)

		expect(spec.paths['/test-route'].post.operationId).toBe('post_test_route')
	})

	it('handles routes with params in path', async () => {
		const fixturesDir = path.join(__dirname, 'fixtures')
		const entries = [
			{
				key: 'users/[id]',
				path: path.relative(fixturesDir, path.join(fixturesDir, 'test-route.ts'))
			}
		]
		const outputPath = path.join(testDir, 'openapi.json')

		await generateOpenAPISpec(entries, fixturesDir, { outputPath })

		const content = await readFile(outputPath, 'utf-8')
		const spec = JSON.parse(content)

		expect(spec.paths['/users/{id}']).toBeDefined()
	})
})
