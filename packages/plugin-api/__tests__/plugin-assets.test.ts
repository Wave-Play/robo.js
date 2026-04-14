/**
 * Tests for Plugin Static Asset Serving
 *
 * Tests the handlePluginStaticFile function for serving static files
 * from plugin public directories with security guards.
 *
 * Note: These tests use fixtures rather than mocking the filesystem.
 */
import { describe, expect, it, jest, beforeEach, beforeAll, afterAll } from '@jest/globals'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { handlePluginStaticFile } from '../.robo/build/core/handler.js'

// Test fixtures directory (ESM compatible)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'plugin-assets-test')
const MOCK_PUBLIC_DIR = path.join(FIXTURES_DIR, 'mock-plugin', 'public')

describe('handlePluginStaticFile()', () => {
	const mockCallback = jest.fn<(filePath: string, mimeType: string) => Promise<void>>()

	beforeAll(() => {
		// Create test fixtures
		mkdirSync(MOCK_PUBLIC_DIR, { recursive: true })
		mkdirSync(path.join(MOCK_PUBLIC_DIR, 'css'), { recursive: true })
		mkdirSync(path.join(MOCK_PUBLIC_DIR, 'nested', 'deep'), { recursive: true })
		mkdirSync(path.join(MOCK_PUBLIC_DIR, 'subdir'), { recursive: true })
		mkdirSync(path.join(MOCK_PUBLIC_DIR, 'empty-dir'), { recursive: true })

		writeFileSync(path.join(MOCK_PUBLIC_DIR, 'index.html'), '<!DOCTYPE html><html></html>')
		writeFileSync(path.join(MOCK_PUBLIC_DIR, 'app.js'), 'console.log("app")')
		writeFileSync(path.join(MOCK_PUBLIC_DIR, 'css', 'style.css'), 'body { margin: 0; }')
		writeFileSync(path.join(MOCK_PUBLIC_DIR, 'nested', 'deep', 'file.json'), '{"key":"value"}')
		writeFileSync(path.join(MOCK_PUBLIC_DIR, 'subdir', 'index.html'), '<!DOCTYPE html>')
		writeFileSync(path.join(MOCK_PUBLIC_DIR, 'empty-dir', 'readme.txt'), 'Just a readme')
	})

	afterAll(() => {
		// Clean up test fixtures
		if (existsSync(FIXTURES_DIR)) {
			rmSync(FIXTURES_DIR, { recursive: true })
		}
	})

	beforeEach(() => {
		mockCallback.mockClear()
	})

	describe('file serving', () => {
		it('should serve existing HTML file', async () => {
			const result = await handlePluginStaticFile('/index.html', MOCK_PUBLIC_DIR, '/index.html', mockCallback)

			expect(result).toBe(true)
			expect(mockCallback).toHaveBeenCalledWith(
				path.join(MOCK_PUBLIC_DIR, 'index.html'),
				'text/html'
			)
		})

		it('should serve JavaScript file with correct MIME type', async () => {
			const result = await handlePluginStaticFile('/app.js', MOCK_PUBLIC_DIR, '/app.js', mockCallback)

			expect(result).toBe(true)
			expect(mockCallback).toHaveBeenCalledWith(
				path.join(MOCK_PUBLIC_DIR, 'app.js'),
				'text/javascript'
			)
		})

		it('should serve CSS file with correct MIME type', async () => {
			const result = await handlePluginStaticFile('/css/style.css', MOCK_PUBLIC_DIR, '/css/style.css', mockCallback)

			expect(result).toBe(true)
			expect(mockCallback).toHaveBeenCalledWith(
				path.join(MOCK_PUBLIC_DIR, 'css', 'style.css'),
				'text/css'
			)
		})

		it('should serve nested files', async () => {
			const result = await handlePluginStaticFile('/nested/deep/file.json', MOCK_PUBLIC_DIR, '/nested/deep/file.json', mockCallback)

			expect(result).toBe(true)
			expect(mockCallback).toHaveBeenCalledWith(
				path.join(MOCK_PUBLIC_DIR, 'nested', 'deep', 'file.json'),
				'application/json'
			)
		})

		it('should return false for non-existent file', async () => {
			const result = await handlePluginStaticFile('/non-existent.txt', MOCK_PUBLIC_DIR, '/non-existent.txt', mockCallback)

			expect(result).toBe(false)
			expect(mockCallback).not.toHaveBeenCalled()
		})
	})

	describe('directory handling', () => {
		it('should serve index.html from directory', async () => {
			const result = await handlePluginStaticFile('/subdir', MOCK_PUBLIC_DIR, '/subdir', mockCallback)

			expect(result).toBe(true)
			expect(mockCallback).toHaveBeenCalledWith(
				path.join(MOCK_PUBLIC_DIR, 'subdir', 'index.html'),
				'text/html'
			)
		})

		it('should return false for directory without index file', async () => {
			const result = await handlePluginStaticFile('/empty-dir', MOCK_PUBLIC_DIR, '/empty-dir', mockCallback)

			expect(result).toBe(false)
		})
	})

	describe('security', () => {
		it('should block path traversal attempts', async () => {
			await expect(
				handlePluginStaticFile('/../../../etc/passwd', MOCK_PUBLIC_DIR, '/../../../etc/passwd', mockCallback)
			).rejects.toBeInstanceOf(Response)

			expect(mockCallback).not.toHaveBeenCalled()
		})

		it('should block encoded path traversal', async () => {
			await expect(
				handlePluginStaticFile('/%2e%2e/%2e%2e/etc/passwd', MOCK_PUBLIC_DIR, '/%2e%2e/%2e%2e/etc/passwd', mockCallback)
			).rejects.toBeInstanceOf(Response)

			expect(mockCallback).not.toHaveBeenCalled()
		})
	})
})

describe('MIME Type Detection', () => {
	const mockCallback = jest.fn<(filePath: string, mimeType: string) => Promise<void>>()
	const MIME_TEST_DIR = path.join(FIXTURES_DIR, 'mime-test', 'public')

	beforeAll(() => {
		mkdirSync(MIME_TEST_DIR, { recursive: true })
	})

	afterAll(() => {
		if (existsSync(path.join(FIXTURES_DIR, 'mime-test'))) {
			rmSync(path.join(FIXTURES_DIR, 'mime-test'), { recursive: true })
		}
	})

	beforeEach(() => {
		mockCallback.mockClear()
	})

	const mimeTests = [
		{ ext: 'html', expected: 'text/html' },
		{ ext: 'css', expected: 'text/css' },
		{ ext: 'js', expected: 'text/javascript' },
		{ ext: 'json', expected: 'application/json' },
		{ ext: 'png', expected: 'image/png' },
		{ ext: 'jpg', expected: 'image/jpeg' },
		{ ext: 'svg', expected: 'image/svg+xml' }
	]

	for (const { ext, expected } of mimeTests) {
		it(`should detect ${ext} as ${expected}`, async () => {
			const testFile = path.join(MIME_TEST_DIR, `test.${ext}`)
			writeFileSync(testFile, 'content')

			await handlePluginStaticFile(`/test.${ext}`, MIME_TEST_DIR, `/test.${ext}`, mockCallback)

			expect(mockCallback).toHaveBeenCalledWith(testFile, expected)

			// Clean up
			rmSync(testFile)
		})
	}

	it('should fall back to application/octet-stream for unknown types', async () => {
		const testFile = path.join(MIME_TEST_DIR, 'file.xyz')
		writeFileSync(testFile, 'unknown content')

		await handlePluginStaticFile('/file.xyz', MIME_TEST_DIR, '/file.xyz', mockCallback)

		expect(mockCallback).toHaveBeenCalledWith(testFile, 'application/octet-stream')

		// Clean up
		rmSync(testFile)
	})
})
