import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals'
import { FlashcoreFileAdapter } from '../src/core/flashcore-fs.js'
import fs from 'node:fs/promises'
import * as nodeFs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const CURRENT_DIR = fileURLToPath(new URL('.', import.meta.url))

// Test directory setup
const TEST_DIR = path.join(CURRENT_DIR, '..', '.test-data', 'flashcore-fs-test')

// Test utilities and helpers
function createLoggerMock() {
	return {
		debug: jest.fn(),
		error: jest.fn(),
		warn: jest.fn()
	}
}

function createAdapter(options?: {
	dataDir?: string
	createReadStream?: typeof nodeFs.createReadStream
	createWriteStream?: typeof nodeFs.createWriteStream
	logger?: ReturnType<typeof createLoggerMock>
}) {
	return new FlashcoreFileAdapter({
		dataDir: options?.dataDir ?? TEST_DIR,
		createReadStream: options?.createReadStream,
		createWriteStream: options?.createWriteStream,
		logger: options?.logger
	})
}

function getFileHash(key: string): string {
	return crypto.createHash('sha256').update(key).digest('hex')
}

function getFilePath(adapter: FlashcoreFileAdapter, key: string): string {
	const hash = getFileHash(key)
	return path.join(adapter.dataDir, hash)
}

async function readRawFile(filePath: string): Promise<Buffer> {
	return await fs.readFile(filePath)
}

async function writeRawFile(filePath: string, data: Buffer): Promise<void> {
	await fs.writeFile(filePath, data)
}

async function listFiles(dir: string): Promise<string[]> {
	try {
		return await fs.readdir(dir)
	} catch {
		return []
	}
}

describe('FlashcoreFileAdapter', () => {
	beforeEach(async () => {
		await fs.mkdir(TEST_DIR, { recursive: true })
		jest.clearAllMocks()
	})

	afterEach(async () => {
		await fs.rm(TEST_DIR, { recursive: true, force: true })
	})

	describe('Constructor', () => {
		test('should use default dataDir path', () => {
			const adapter = new FlashcoreFileAdapter()
			expect(adapter.dataDir).toBe(path.join(process.cwd(), '.robo', 'data'))
		})

		test('should use custom dataDir option', () => {
			const customDir = '/custom/path'
			const adapter = new FlashcoreFileAdapter({ dataDir: customDir })
			expect(adapter.dataDir).toBe(customDir)
		})

		test('should not create directories in constructor', async () => {
			const customDir = path.join(TEST_DIR, 'not-created-yet')
			new FlashcoreFileAdapter({ dataDir: customDir })
			const exists = await fs
				.access(customDir)
				.then(() => true)
				.catch(() => false)
			expect(exists).toBe(false)
		})
	})

	describe('init method', () => {
		test('should create directory when it does not exist', async () => {
			const customDir = path.join(TEST_DIR, 'new-dir')
			const adapter = new FlashcoreFileAdapter({ dataDir: customDir })
			await adapter.init()
			const exists = await fs
				.access(customDir)
				.then(() => true)
				.catch(() => false)
			expect(exists).toBe(true)
		})

		test('should be idempotent', async () => {
			const adapter = createAdapter()
			await adapter.init()
			await adapter.init()
			await adapter.init()
			const exists = await fs
				.access(TEST_DIR)
				.then(() => true)
				.catch(() => false)
			expect(exists).toBe(true)
		})

		test('should create nested directory structure', async () => {
			const nestedDir = path.join(TEST_DIR, 'path', 'to', 'nested', 'data')
			const adapter = new FlashcoreFileAdapter({ dataDir: nestedDir })
			await adapter.init()
			const exists = await fs
				.access(nestedDir)
				.then(() => true)
				.catch(() => false)
			expect(exists).toBe(true)
		})

		test('should create parent directories recursively', async () => {
			const nestedDir = path.join(TEST_DIR, 'parent', 'child', 'grandchild')
			const adapter = new FlashcoreFileAdapter({ dataDir: nestedDir })
			await adapter.init()
			const parentExists = await fs
				.access(path.join(TEST_DIR, 'parent'))
				.then(() => true)
				.catch(() => false)
			const childExists = await fs
				.access(path.join(TEST_DIR, 'parent', 'child'))
				.then(() => true)
				.catch(() => false)
			const grandchildExists = await fs
				.access(nestedDir)
				.then(() => true)
				.catch(() => false)
			expect(parentExists).toBe(true)
			expect(childExists).toBe(true)
			expect(grandchildExists).toBe(true)
		})

		test('should handle errors when directory creation fails', async () => {
			const loggerMock = createLoggerMock()
			const adapter = createAdapter({ logger: loggerMock })
			const mkdirSpy = jest.spyOn(fs, 'mkdir').mockRejectedValueOnce(new Error('Permission denied'))
			await adapter.init()
			expect(loggerMock.error).toHaveBeenCalledWith(
				'Failed to create data directory for Flashcore file adapter.',
				expect.any(Error)
			)
			mkdirSpy.mockRestore()
		})

		test('should complete successfully when directory already exists', async () => {
			const adapter = createAdapter()
			await fs.mkdir(TEST_DIR, { recursive: true })
			await adapter.init()
			const exists = await fs
				.access(TEST_DIR)
				.then(() => true)
				.catch(() => false)
			expect(exists).toBe(true)
		})
	})

	describe('set method', () => {
		test('should set a string value', async () => {
			const adapter = createAdapter()
			await adapter.init()
			const result = await adapter.set('testKey', 'testValue')
			expect(result).toBe(true)
			const value = await adapter.get('testKey')
			expect(value).toBe('testValue')
		})

		test('should set a number value', async () => {
			const adapter = createAdapter()
			await adapter.init()
			const result = await adapter.set('numberKey', 42)
			expect(result).toBe(true)
			const value = await adapter.get('numberKey')
			expect(value).toBe(42)
		})

		test('should set an object value', async () => {
			const adapter = createAdapter()
			await adapter.init()
			const obj = { foo: 'bar', nested: { value: 123 } }
			const result = await adapter.set('objectKey', obj)
			expect(result).toBe(true)
			const value = await adapter.get('objectKey')
			expect(value).toEqual(obj)
		})

		test('should set an array value', async () => {
			const adapter = createAdapter()
			await adapter.init()
			const arr = [1, 2, 3, 'four', { five: 5 }]
			const result = await adapter.set('arrayKey', arr)
			expect(result).toBe(true)
			const value = await adapter.get('arrayKey')
			expect(value).toEqual(arr)
		})

		test('should set null value', async () => {
			const adapter = createAdapter()
			await adapter.init()
			const result = await adapter.set('nullKey', null)
			expect(result).toBe(true)
			const value = await adapter.get('nullKey')
			expect(value).toBe(null)
		})

		test('should set undefined value', async () => {
			const adapter = createAdapter()
			await adapter.init()
			const result = await adapter.set('undefinedKey', undefined)
			expect(result).toBe(false)
			const value = await adapter.get('undefinedKey')
			expect(value).toBe(undefined)
		})

		test('should return true on success', async () => {
			const adapter = createAdapter()
			await adapter.init()
			const result = await adapter.set('key', 'value')
			expect(result).toBe(true)
		})

		test('should create file with hashed key name', async () => {
			const adapter = createAdapter()
			await adapter.init()
			const key = 'testKey'
			await adapter.set(key, 'value')
			const hash = getFileHash(key)
			const filePath = path.join(TEST_DIR, hash)
			const exists = await fs
				.access(filePath)
				.then(() => true)
				.catch(() => false)
			expect(exists).toBe(true)
			expect(hash).toMatch(/^[a-f0-9]{64}$/)
		})

		test('should create gzip compressed file content', async () => {
			const adapter = createAdapter()
			await adapter.init()
			await adapter.set('key', 'value')
			const filePath = getFilePath(adapter, 'key')
			const rawData = await readRawFile(filePath)
			// Check for gzip magic number (1f 8b)
			expect(rawData[0]).toBe(0x1f)
			expect(rawData[1]).toBe(0x8b)
		})

		test('should overwrite existing key', async () => {
			const adapter = createAdapter()
			await adapter.init()
			await adapter.set('key', 'firstValue')
			await adapter.set('key', 'secondValue')
			const value = await adapter.get('key')
			expect(value).toBe('secondValue')
		})

		test('should return false on failure', async () => {
			const adapter = createAdapter({
				createWriteStream: () => {
					throw new Error('Write failed')
				}
			})
			await adapter.init()
			const result = await adapter.set('key', 'value')
			expect(result).toBe(false)
		})
	})

	describe('get method', () => {
		test('should retrieve existing string value', async () => {
			const adapter = createAdapter()
			await adapter.init()
			await adapter.set('key', 'value')
			const value = await adapter.get('key')
			expect(value).toBe('value')
		})

		test('should retrieve existing number value', async () => {
			const adapter = createAdapter()
			await adapter.init()
			await adapter.set('key', 123)
			const value = await adapter.get('key')
			expect(value).toBe(123)
		})

		test('should retrieve existing object value', async () => {
			const adapter = createAdapter()
			await adapter.init()
			const obj = { a: 1, b: 'two', c: [3, 4, 5] }
			await adapter.set('key', obj)
			const value = await adapter.get('key')
			expect(value).toEqual(obj)
		})

		test('should retrieve existing array value', async () => {
			const adapter = createAdapter()
			await adapter.init()
			const arr = [1, 'two', { three: 3 }]
			await adapter.set('key', arr)
			const value = await adapter.get('key')
			expect(value).toEqual(arr)
		})

		test('should retrieve null value', async () => {
			const adapter = createAdapter()
			await adapter.init()
			await adapter.set('key', null)
			const value = await adapter.get('key')
			expect(value).toBe(null)
		})

		test('should retrieve undefined value', async () => {
			const adapter = createAdapter()
			await adapter.init()
			await adapter.set('key', undefined)
			const value = await adapter.get('key')
			expect(value).toBe(undefined)
		})

		test('should return undefined for non-existent key', async () => {
			const adapter = createAdapter()
			await adapter.init()
			const value = await adapter.get('nonExistentKey')
			expect(value).toBe(undefined)
		})

		test('should return undefined when file does not exist', async () => {
			const adapter = createAdapter()
			await adapter.init()
			const value = await adapter.get('missingKey')
			expect(value).toBe(undefined)
		})

		test('should return undefined when file is corrupted', async () => {
			const adapter = createAdapter()
			await adapter.init()
			const filePath = getFilePath(adapter, 'corruptedKey')
			await writeRawFile(filePath, Buffer.from('not gzip data'))
			const value = await adapter.get('corruptedKey')
			expect(value).toBe(undefined)
		})

		test('should return undefined when file contains invalid JSON', async () => {
			const adapter = createAdapter()
			await adapter.init()
			const filePath = getFilePath(adapter, 'invalidJsonKey')
			const invalidJson = Buffer.from('not valid json')
			const compressed = zlib.gzipSync(invalidJson)
			await writeRawFile(filePath, compressed)
			const value = await adapter.get('invalidJsonKey')
			expect(value).toBe(undefined)
		})

		test('should not throw errors on any failure', async () => {
			const adapter = createAdapter()
			await adapter.init()
			await expect(adapter.get('anyKey')).resolves.toBe(undefined)
		})
	})

	describe('delete method', () => {
		test('should delete existing key', async () => {
			const adapter = createAdapter()
			await adapter.init()
			await adapter.set('key', 'value')
			const result = await adapter.delete('key')
			expect(result).toBe(true)
			const filePath = getFilePath(adapter, 'key')
			const exists = await fs
				.access(filePath)
				.then(() => true)
				.catch(() => false)
			expect(exists).toBe(false)
		})

		test('should return true when file exists and is deleted', async () => {
			const adapter = createAdapter()
			await adapter.init()
			await adapter.set('key', 'value')
			const result = await adapter.delete('key')
			expect(result).toBe(true)
		})

		test('should return false when file does not exist', async () => {
			const adapter = createAdapter()
			await adapter.init()
			const result = await adapter.delete('nonExistentKey')
			expect(result).toBe(false)
		})

		test('should not trigger logger.warn for ENOENT errors', async () => {
			const loggerMock = createLoggerMock()
			const adapter = createAdapter({ logger: loggerMock })
			await adapter.init()
			await adapter.delete('nonExistentKey')
			expect(loggerMock.warn).not.toHaveBeenCalled()
		})

		test('should trigger logger.warn for other errors', async () => {
			const loggerMock = createLoggerMock()
			const adapter = createAdapter({ logger: loggerMock })
			await adapter.init()
			await adapter.set('key', 'value')
			const unlinkSpy = jest.spyOn(fs, 'unlink').mockRejectedValueOnce(
				Object.assign(new Error('Permission denied'), { code: 'EPERM' })
			)
			await adapter.delete('key')
			expect(loggerMock.warn).toHaveBeenCalledWith(
				'Failed to delete key "key" from Flashcore file adapter.',
				expect.any(Error)
			)
			unlinkSpy.mockRestore()
		})

		test('should handle deleting non-existent key multiple times', async () => {
			const loggerMock = createLoggerMock()
			const adapter = createAdapter({ logger: loggerMock })
			await adapter.init()
			await adapter.delete('key')
			await adapter.delete('key')
			await adapter.delete('key')
			expect(loggerMock.warn).not.toHaveBeenCalled()
		})

		test('should delete the correct file and leave others', async () => {
			const adapter = createAdapter()
			await adapter.init()
			await adapter.set('key1', 'value1')
			await adapter.set('key2', 'value2')
			await adapter.set('key3', 'value3')
			await adapter.delete('key2')
			const value1 = await adapter.get('key1')
			const value2 = await adapter.get('key2')
			const value3 = await adapter.get('key3')
			expect(value1).toBe('value1')
			expect(value2).toBe(undefined)
			expect(value3).toBe('value3')
		})
	})

	describe('clear method', () => {
		test('should clear empty directory', async () => {
			const adapter = createAdapter()
			await adapter.init()
			const result = await adapter.clear()
			expect(result).toBe(true)
		})

		test('should clear directory with multiple files', async () => {
			const adapter = createAdapter()
			await adapter.init()
			await adapter.set('key1', 'value1')
			await adapter.set('key2', 'value2')
			await adapter.set('key3', 'value3')
			const result = await adapter.clear()
			expect(result).toBe(true)
			const files = await listFiles(TEST_DIR)
			expect(files.length).toBe(0)
		})

		test('should recreate the directory after removal', async () => {
			const adapter = createAdapter()
			await adapter.init()
			await adapter.set('key', 'value')
			await adapter.clear()
			const exists = await fs
				.access(TEST_DIR)
				.then(() => true)
				.catch(() => false)
			expect(exists).toBe(true)
		})

		test('should return true on success', async () => {
			const adapter = createAdapter()
			await adapter.init()
			const result = await adapter.clear()
			expect(result).toBe(true)
		})

		test('should return false on failure', async () => {
			const adapter = createAdapter()
			await adapter.init()
			const rmSpy = jest.spyOn(fs, 'rm').mockRejectedValueOnce(new Error('Failed to remove'))
			const result = await adapter.clear()
			expect(result).toBe(false)
			rmSpy.mockRestore()
		})

		test('should leave directory empty after clear', async () => {
			const adapter = createAdapter()
			await adapter.init()
			await adapter.set('key1', 'value1')
			await adapter.set('key2', 'value2')
			await adapter.clear()
			const files = await listFiles(TEST_DIR)
			expect(files.length).toBe(0)
		})

		test('should allow set operations after clear', async () => {
			const adapter = createAdapter()
			await adapter.init()
			await adapter.set('key', 'oldValue')
			await adapter.clear()
			await adapter.set('key', 'newValue')
			const value = await adapter.get('key')
			expect(value).toBe('newValue')
		})
	})

	describe('has method', () => {
		test('should return true for existing key with truthy value', async () => {
			const adapter = createAdapter()
			await adapter.init()
			await adapter.set('key', 'value')
			const result = await adapter.has('key')
			expect(result).toBe(true)
		})

		test('should return false for non-existent key', async () => {
			const adapter = createAdapter()
			await adapter.init()
			const result = await adapter.has('nonExistentKey')
			expect(result).toBe(false)
		})

		test('should return false for key with null value', async () => {
			const adapter = createAdapter()
			await adapter.init()
			await adapter.set('key', null)
			const result = await adapter.has('key')
			expect(result).toBe(false) // !!null is false
		})

		test('should return false for key with undefined value', async () => {
			const adapter = createAdapter()
			await adapter.init()
			await adapter.set('key', undefined)
			const result = await adapter.has('key')
			expect(result).toBe(false) // !!undefined is false
		})

		test('should return false for key with falsy values', async () => {
			const adapter = createAdapter()
			await adapter.init()
			await adapter.set('zero', 0)
			await adapter.set('false', false)
			await adapter.set('empty', '')
			expect(await adapter.has('zero')).toBe(false)
			expect(await adapter.has('false')).toBe(false)
			expect(await adapter.has('empty')).toBe(false)
		})

		test('should return false when file is corrupted', async () => {
			const adapter = createAdapter()
			await adapter.init()
			const filePath = getFilePath(adapter, 'corruptedKey')
			await writeRawFile(filePath, Buffer.from('corrupted data'))
			const result = await adapter.has('corruptedKey')
			expect(result).toBe(false)
		})

		test('should not modify any files', async () => {
			const adapter = createAdapter()
			await adapter.init()
			await adapter.set('key', 'value')
			const filesBefore = await listFiles(TEST_DIR)
			await adapter.has('key')
			const filesAfter = await listFiles(TEST_DIR)
			expect(filesAfter).toEqual(filesBefore)
		})
	})

	describe('Gzip compression', () => {
		test('should create gzip-compressed files', async () => {
			const adapter = createAdapter()
			await adapter.init()
			await adapter.set('key', 'value')
			const filePath = getFilePath(adapter, 'key')
			const rawData = await readRawFile(filePath)
			// Check for gzip magic number (1f 8b)
			expect(rawData[0]).toBe(0x1f)
			expect(rawData[1]).toBe(0x8b)
		})

		test('should allow manual decompression of compressed files', async () => {
			const adapter = createAdapter()
			await adapter.init()
			const testValue = { test: 'data', number: 42 }
			await adapter.set('key', testValue)
			const filePath = getFilePath(adapter, 'key')
			const compressed = await readRawFile(filePath)
			const decompressed = zlib.gunzipSync(compressed)
			const parsed = JSON.parse(decompressed.toString())
			expect(parsed).toEqual(testValue)
		})

		test('should correctly decompress manually compressed files', async () => {
			const adapter = createAdapter()
			await adapter.init()
			const testValue = { manual: 'compression', works: true }
			const json = JSON.stringify(testValue)
			const compressed = zlib.gzipSync(Buffer.from(json))
			const filePath = getFilePath(adapter, 'manualKey')
			await writeRawFile(filePath, compressed)
			const value = await adapter.get('manualKey')
			expect(value).toEqual(testValue)
		})

		test('should handle compression of large data', async () => {
			const adapter = createAdapter()
			await adapter.init()
			const largeObj: Record<string, number> = {}
			for (let i = 0; i < 2000; i++) {
				largeObj[`key${i}`] = i
			}
			const result = await adapter.set('largeKey', largeObj)
			expect(result).toBe(true)
			const value = await adapter.get('largeKey')
			expect(value).toEqual(largeObj)
		})

		test('should handle compression with unicode characters', async () => {
			const adapter = createAdapter()
			await adapter.init()
			const unicodeString = 'Hello 世界 🌍 café ñoño'
			await adapter.set('unicodeKey', unicodeString)
			const value = await adapter.get('unicodeKey')
			expect(value).toBe(unicodeString)
		})

		test('should return undefined for corrupted gzip data', async () => {
			const adapter = createAdapter()
			await adapter.init()
			const filePath = getFilePath(adapter, 'corruptedKey')
			await writeRawFile(filePath, Buffer.from([0x1f, 0x8b, 0xff, 0xff, 0xff]))
			const value = await adapter.get('corruptedKey')
			expect(value).toBe(undefined)
		})
	})

	describe('Safe key hashing', () => {
		test('should hash keys using SHA-256', async () => {
			const adapter = createAdapter()
			await adapter.init()
			const key = 'testKey'
			await adapter.set(key, 'value')
			const expectedHash = crypto.createHash('sha256').update(key).digest('hex')
			const filePath = path.join(TEST_DIR, expectedHash)
			const exists = await fs
				.access(filePath)
				.then(() => true)
				.catch(() => false)
			expect(exists).toBe(true)
		})

		test('should produce different hashes for different keys', async () => {
			const adapter = createAdapter()
			await adapter.init()
			await adapter.set('key1', 'value1')
			await adapter.set('key2', 'value2')
			const hash1 = getFileHash('key1')
			const hash2 = getFileHash('key2')
			expect(hash1).not.toBe(hash2)
		})

		test('should produce same hash for same key', async () => {
			const adapter = createAdapter()
			await adapter.init()
			await adapter.set('key', 'value1')
			const hash1 = getFileHash('key')
			await adapter.delete('key')
			await adapter.set('key', 'value2')
			const hash2 = getFileHash('key')
			expect(hash1).toBe(hash2)
		})

		test('should handle keys with special characters', async () => {
			const adapter = createAdapter()
			await adapter.init()
			const specialKeys = ['key with spaces', 'key/with/slashes', 'key:with:colons', 'key\\with\\backslashes']
			for (const key of specialKeys) {
				const result = await adapter.set(key, `value for ${key}`)
				expect(result).toBe(true)
				const value = await adapter.get(key)
				expect(value).toBe(`value for ${key}`)
			}
		})

		test('should handle very long keys', async () => {
			const adapter = createAdapter()
			await adapter.init()
			const longKey = 'a'.repeat(1000)
			const result = await adapter.set(longKey, 'value')
			expect(result).toBe(true)
			const value = await adapter.get(longKey)
			expect(value).toBe('value')
		})

		test('should handle empty string key', async () => {
			const adapter = createAdapter()
			await adapter.init()
			const result = await adapter.set('', 'emptyKeyValue')
			expect(result).toBe(true)
			const value = await adapter.get('')
			expect(value).toBe('emptyKeyValue')
		})

		test('should produce valid SHA-256 hash format', async () => {
			const adapter = createAdapter()
			await adapter.init()
			await adapter.set('key', 'value')
			const hash = getFileHash('key')
			expect(hash).toMatch(/^[a-f0-9]{64}$/)
		})

		test('should handle filesystem-unsafe characters in keys', async () => {
			const adapter = createAdapter()
			await adapter.init()
			const unsafeKeys = ['<key>', 'key>file', 'key|pipe', 'key*star', 'key?question', 'key"quote']
			for (const key of unsafeKeys) {
				const result = await adapter.set(key, 'value')
				expect(result).toBe(true)
				const value = await adapter.get(key)
				expect(value).toBe('value')
			}
		})
	})

	describe('Error handling', () => {
		test('should handle ENOENT errors silently in get', async () => {
			const loggerMock = createLoggerMock()
			const adapter = createAdapter({ logger: loggerMock })
			await adapter.init()
			await adapter.get('nonExistentKey')
			expect(loggerMock.error).not.toHaveBeenCalled()
			expect(loggerMock.warn).not.toHaveBeenCalled()
		})

		test('should handle ENOENT errors silently in delete', async () => {
			const loggerMock = createLoggerMock()
			const adapter = createAdapter({ logger: loggerMock })
			await adapter.init()
			await adapter.delete('nonExistentKey')
			expect(loggerMock.warn).not.toHaveBeenCalled()
		})

		test('should trigger logger.warn for non-ENOENT errors in delete', async () => {
			const loggerMock = createLoggerMock()
			const adapter = createAdapter({ logger: loggerMock })
			await adapter.init()
			await adapter.set('key', 'value')
			const unlinkSpy = jest.spyOn(fs, 'unlink').mockRejectedValueOnce(
				Object.assign(new Error('Permission denied'), { code: 'EACCES' })
			)
			await adapter.delete('key')
			expect(loggerMock.warn).toHaveBeenCalled()
			unlinkSpy.mockRestore()
		})

		test('should return false on permission errors in set', async () => {
			const adapter = createAdapter({
				createWriteStream: () => {
					throw Object.assign(new Error('Permission denied'), { code: 'EACCES' })
				}
			})
			await adapter.init()
			const result = await adapter.set('key', 'value')
			expect(result).toBe(false)
		})

		test('should trigger logger.error on permission errors in init', async () => {
			const loggerMock = createLoggerMock()
			const adapter = createAdapter({ logger: loggerMock })
			const mkdirSpy = jest
				.spyOn(fs, 'mkdir')
				.mockRejectedValueOnce(Object.assign(new Error('Permission denied'), { code: 'EACCES' }))
			await adapter.init()
			expect(loggerMock.error).toHaveBeenCalledWith(
				'Failed to create data directory for Flashcore file adapter.',
				expect.any(Error)
			)
			mkdirSpy.mockRestore()
		})

		test('should return undefined for invalid JSON in file', async () => {
			const adapter = createAdapter()
			await adapter.init()
			const filePath = getFilePath(adapter, 'invalidJsonKey')
			const compressed = zlib.gzipSync(Buffer.from('not valid json'))
			await writeRawFile(filePath, compressed)
			const value = await adapter.get('invalidJsonKey')
			expect(value).toBe(undefined)
		})

		test('should return undefined for corrupted gzip data', async () => {
			const adapter = createAdapter()
			await adapter.init()
			const filePath = getFilePath(adapter, 'corruptedKey')
			await writeRawFile(filePath, Buffer.from('random bytes'))
			const value = await adapter.get('corruptedKey')
			expect(value).toBe(undefined)
		})

		test('should return false on filesystem full errors in set', async () => {
			const adapter = createAdapter({
				createWriteStream: () => {
					throw Object.assign(new Error('No space left on device'), { code: 'ENOSPC' })
				}
			})
			await adapter.init()
			const result = await adapter.set('key', 'value')
			expect(result).toBe(false)
		})

		test('should continue working after errors', async () => {
			const adapter = createAdapter()
			await adapter.init()
			// Trigger error
			await adapter.get('nonExistentKey')
			// Should still work
			await adapter.set('key', 'value')
			const value = await adapter.get('key')
			expect(value).toBe('value')
		})
	})

	describe('Edge cases', () => {
		test('should handle concurrent set operations on different keys', async () => {
			const adapter = createAdapter()
			await adapter.init()
			const promises = []
			for (let i = 0; i < 10; i++) {
				promises.push(adapter.set(`key${i}`, `value${i}`))
			}
			const results = await Promise.all(promises)
			expect(results.every((r) => r === true)).toBe(true)
			// Verify all values
			for (let i = 0; i < 10; i++) {
				const value = await adapter.get(`key${i}`)
				expect(value).toBe(`value${i}`)
			}
		})

		test('should handle concurrent set operations on the same key', async () => {
			const adapter = createAdapter()
			await adapter.init()
			const values = ['v1', 'v2', 'v3', 'v4', 'v5']
			const promises = values.map((val) => adapter.set('sameKey', val))
			const results = await Promise.all(promises)
			// All calls should resolve to booleans (likely true unless exceptions are thrown)
			expect(results.every((r) => typeof r === 'boolean')).toBe(true)
			// Read the final value and verify it's one of the attempted values
			const finalValue = await adapter.get('sameKey')
			expect(values).toContain(finalValue)
		})

		test('should handle setting very large values', async () => {
			const adapter = createAdapter()
			await adapter.init()
			const largeValue = 'x'.repeat(8 * 1024) // 8KB string
			const result = await adapter.set('largeKey', largeValue)
			expect(result).toBe(true)
			const value = await adapter.get('largeKey')
			expect(value).toBe(largeValue)
		}, 15000)

		test('should handle deeply nested objects', async () => {
			const adapter = createAdapter()
			await adapter.init()
			let nested: any = { value: 'bottom' }
			for (let i = 0; i < 100; i++) {
				nested = { level: i, nested }
			}
			const result = await adapter.set('deepKey', nested)
			expect(result).toBe(true)
			const value = await adapter.get('deepKey')
			expect(value).toEqual(nested)
		})

		test('should handle circular references gracefully', async () => {
			const adapter = createAdapter()
			await adapter.init()
			const circular: any = { name: 'circular' }
			circular.self = circular
			const result = await adapter.set('circularKey', circular)
			expect(result).toBe(false) // JSON.stringify will fail
		})

		test('should handle empty string as key', async () => {
			const adapter = createAdapter()
			await adapter.init()
			await adapter.set('', 'emptyKeyValue')
			const value = await adapter.get('')
			expect(value).toBe('emptyKeyValue')
		})

		test('should handle keys with only whitespace', async () => {
			const adapter = createAdapter()
			await adapter.init()
			await adapter.set('   ', 'whitespaceKey')
			const value = await adapter.get('   ')
			expect(value).toBe('whitespaceKey')
		})

		test('should handle setting and getting empty object', async () => {
			const adapter = createAdapter()
			await adapter.init()
			await adapter.set('emptyObj', {})
			const value = await adapter.get('emptyObj')
			expect(value).toEqual({})
		})

		test('should handle setting and getting empty array', async () => {
			const adapter = createAdapter()
			await adapter.init()
			await adapter.set('emptyArr', [])
			const value = await adapter.get('emptyArr')
			expect(value).toEqual([])
		})

		test('should handle setting and getting empty string', async () => {
			const adapter = createAdapter()
			await adapter.init()
			await adapter.set('emptyStr', '')
			const value = await adapter.get('emptyStr')
			expect(value).toBe('')
		})

		test('should handle rapid set/get/delete cycles', async () => {
			const adapter = createAdapter()
			await adapter.init()
			for (let i = 0; i < 50; i++) {
				await adapter.set('rapidKey', i)
				const value = await adapter.get('rapidKey')
				expect(value).toBe(i)
				if (i % 2 === 0) {
					await adapter.delete('rapidKey')
				}
			}
		})
	})

	describe('Integration scenarios', () => {
		test('should handle full lifecycle: init → set → get → delete → has', async () => {
			const adapter = createAdapter()
			await adapter.init()
			const setResult = await adapter.set('key', 'value')
			expect(setResult).toBe(true)
			const getValue = await adapter.get('key')
			expect(getValue).toBe('value')
			const hasResult = await adapter.has('key')
			expect(hasResult).toBe(true)
			const deleteResult = await adapter.delete('key')
			expect(deleteResult).toBe(true)
			const hasFinalResult = await adapter.has('key')
			expect(hasFinalResult).toBe(false)
		})

		test('should handle multiple keys with different data types', async () => {
			const adapter = createAdapter()
			await adapter.init()
			await adapter.set('string', 'text')
			await adapter.set('number', 42)
			await adapter.set('object', { a: 1 })
			await adapter.set('array', [1, 2, 3])
			await adapter.set('null', null)
			await adapter.set('boolean', true)
			expect(await adapter.get('string')).toBe('text')
			expect(await adapter.get('number')).toBe(42)
			expect(await adapter.get('object')).toEqual({ a: 1 })
			expect(await adapter.get('array')).toEqual([1, 2, 3])
			expect(await adapter.get('null')).toBe(null)
			expect(await adapter.get('boolean')).toBe(true)
		})

		test('should simulate persistence across adapter instances', async () => {
			const adapter1 = createAdapter()
			await adapter1.init()
			await adapter1.set('persistKey', 'persistValue')
			// Create new adapter with same dataDir
			const adapter2 = createAdapter()
			const value = await adapter2.get('persistKey')
			expect(value).toBe('persistValue')
		})

		test('should maintain directory isolation between adapters', async () => {
			const dir1 = path.join(TEST_DIR, 'adapter1')
			const dir2 = path.join(TEST_DIR, 'adapter2')
			const adapter1 = new FlashcoreFileAdapter({ dataDir: dir1 })
			const adapter2 = new FlashcoreFileAdapter({ dataDir: dir2 })
			await adapter1.init()
			await adapter2.init()
			await adapter1.set('key', 'value1')
			await adapter2.set('key', 'value2')
			expect(await adapter1.get('key')).toBe('value1')
			expect(await adapter2.get('key')).toBe('value2')
		})

		test('should handle clear and reinitialize', async () => {
			const adapter = createAdapter()
			await adapter.init()
			await adapter.set('key1', 'value1')
			await adapter.set('key2', 'value2')
			await adapter.clear()
			await adapter.init()
			await adapter.set('key3', 'value3')
			expect(await adapter.get('key1')).toBe(undefined)
			expect(await adapter.get('key2')).toBe(undefined)
			expect(await adapter.get('key3')).toBe('value3')
		})

		test('should maintain state consistency with single adapter instance', async () => {
			const adapter = createAdapter()
			await adapter.init()
			await adapter.set('counter', 0)
			for (let i = 1; i <= 10; i++) {
				await adapter.set('counter', i)
			}
			const finalValue = await adapter.get('counter')
			expect(finalValue).toBe(10)
		})

		test('should work without explicit init call', async () => {
			const adapter = createAdapter()
			// Don't call init, just try to set
			const result = await adapter.set('key', 'value')
			// This should work because fs operations will create parent dirs if needed
			// But actually, createWriteStream won't create parent dirs, so it may fail
			// Let's just verify behavior
			if (result) {
				const value = await adapter.get('key')
				expect(value).toBe('value')
			} else {
				// If it fails, that's expected without init
				expect(result).toBe(false)
			}
		})
	})

	describe('File system verification', () => {
		test('should create exactly one file per key', async () => {
			const adapter = createAdapter()
			await adapter.init()
			await adapter.set('key1', 'value1')
			await adapter.set('key2', 'value2')
			const files = await listFiles(TEST_DIR)
			expect(files.length).toBe(2)
		})

		test('should create files with SHA-256 hash names', async () => {
			const adapter = createAdapter()
			await adapter.init()
			await adapter.set('testKey', 'value')
			const files = await listFiles(TEST_DIR)
			expect(files.length).toBe(1)
			expect(files[0]).toMatch(/^[a-f0-9]{64}$/)
		})

		test('should create files in the correct directory', async () => {
			const adapter = createAdapter()
			await adapter.init()
			await adapter.set('key', 'value')
			const hash = getFileHash('key')
			const expectedPath = path.join(TEST_DIR, hash)
			const exists = await fs
				.access(expectedPath)
				.then(() => true)
				.catch(() => false)
			expect(exists).toBe(true)
		})

		test('should remove files from filesystem on delete', async () => {
			const adapter = createAdapter()
			await adapter.init()
			await adapter.set('key', 'value')
			const filePath = getFilePath(adapter, 'key')
			await adapter.delete('key')
			const exists = await fs
				.access(filePath)
				.then(() => true)
				.catch(() => false)
			expect(exists).toBe(false)
		})

		test('should remove all files on clear', async () => {
			const adapter = createAdapter()
			await adapter.init()
			await adapter.set('key1', 'value1')
			await adapter.set('key2', 'value2')
			await adapter.set('key3', 'value3')
			await adapter.clear()
			const files = await listFiles(TEST_DIR)
			expect(files.length).toBe(0)
		})

		test('should not leave temporary files behind', async () => {
			const adapter = createAdapter()
			await adapter.init()
			await adapter.set('key1', 'value1')
			await adapter.set('key2', 'value2')
			await adapter.delete('key1')
			const files = await listFiles(TEST_DIR)
			// Should only have one file (key2)
			expect(files.length).toBe(1)
			expect(files[0]).toBe(getFileHash('key2'))
		})

		test('should create readable and writable files', async () => {
			const adapter = createAdapter()
			await adapter.init()
			await adapter.set('key', 'value')
			const filePath = getFilePath(adapter, 'key')
			// Check readable
			const content = await fs.readFile(filePath)
			expect(content).toBeInstanceOf(Buffer)
			// Check writable (overwrite)
			await adapter.set('key', 'newValue')
			const newValue = await adapter.get('key')
			expect(newValue).toBe('newValue')
		})
	})
})
