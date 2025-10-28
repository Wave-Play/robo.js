import { describe, expect, test, beforeEach, afterEach, jest } from '@jest/globals'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Constants
const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url))
const TEMP_ENV_DIR = path.join(CURRENT_DIR, '.temp-env-test')
const NEUTRAL_ENV = {
	NODE_ENV: 'test',
	PATH: process.env.PATH || '',
	HOME: process.env.HOME || '',
	USER: process.env.USER || '',
	SHELL: process.env.SHELL || ''
}

// Types
interface WithFreshEnvOptions {
	envVars?: Record<string, string>
	mockFs?: boolean
	mockBunRuntime?: boolean
}

// Test Utilities
function createMockFs(config: {
	files?: Record<string, string>
	existingFiles?: string[]
	throwOnRead?: boolean
} = {}) {
	const { files = {}, existingFiles = [], throwOnRead = false } = config

	return {
		existsSync: jest.fn((filePath: string) => {
			return existingFiles.includes(filePath) || Object.keys(files).includes(filePath)
		}),
		readFileSync: jest.fn((filePath: string) => {
			if (throwOnRead) {
				throw new Error('File read error')
			}
			return files[filePath] || ''
		}),
		readFile: jest.fn(async (filePath: string) => {
			if (throwOnRead) {
				throw new Error('File read error')
			}
			return files[filePath] || ''
		})
	}
}

async function createTempEnvFile(filename: string, content: string): Promise<string> {
	await fs.mkdir(TEMP_ENV_DIR, { recursive: true })
	const filePath = path.join(TEMP_ENV_DIR, filename)
	await fs.writeFile(filePath, content, 'utf-8')
	return filePath
}

async function cleanupTempFiles() {
	try {
		await fs.rm(TEMP_ENV_DIR, { recursive: true, force: true })
	} catch (error) {
		// Ignore cleanup errors
	}
}

function mockLogger() {
	return {
		debug: jest.fn(),
		error: jest.fn(),
		warn: jest.fn(),
		info: jest.fn()
	}
}

async function withFreshEnv<T>(
	options: WithFreshEnvOptions,
	testFn: (env: any) => Promise<T> | T
): Promise<T> {
	const { envVars = {}, mockFs = false, mockBunRuntime = false } = options

	const originalEnv = { ...process.env }
	const originalCwd = process.cwd()

	try {
		return await jest.isolateModulesAsync(async () => {
			// Set up neutral environment
			process.env = { ...NEUTRAL_ENV, ...envVars }

			// Mock file system if requested
			if (mockFs) {
				jest.unstable_mockModule('node:fs', () => ({
					existsSync: jest.fn(() => false),
					readFileSync: jest.fn(() => ''),
					default: {
						existsSync: jest.fn(() => false),
						readFileSync: jest.fn(() => '')
					}
				}))

				jest.unstable_mockModule('node:fs/promises', () => ({
					readFile: jest.fn(async () => ''),
					default: {
						readFile: jest.fn(async () => '')
					}
				}))
			}

			// Mock Bun runtime if requested
			if (mockBunRuntime) {
				jest.unstable_mockModule('../cli/utils/runtime-utils.js', () => ({
					IS_BUN_RUNTIME: true
				}))
			}

			// Mock logger to suppress output
			const logger = mockLogger()
			jest.unstable_mockModule('./logger.js', () => ({
				logger,
				default: logger
			}))

			// Import the env module
			const envModule = await import('../dist/core/env.js')

			return await testFn(envModule)
		})
	} finally {
		// Restore original state
		process.env = originalEnv
		process.chdir(originalCwd)
	}
}

// Setup and Teardown
beforeEach(async () => {
	await fs.mkdir(TEMP_ENV_DIR, { recursive: true })
	await cleanupTempFiles()
	jest.clearAllMocks()
})

afterEach(async () => {
	await cleanupTempFiles()
	jest.clearAllMocks()
})

// Test Suites

describe('Env class instantiation with schema', () => {
	test('Env constructor accepts schema object and stores it internally', async () => {
		await withFreshEnv({}, async (envModule) => {
			const schema = { test: { env: 'TEST', default: 'value' } }
			const env = new envModule.Env(schema)
			expect(env).toBeDefined()
		})
	})

	test('Env constructor with simple flat schema (single level keys)', async () => {
		await withFreshEnv({ envVars: { TEST_KEY: 'test_value' } }, async (envModule) => {
			const schema = {
				testKey: { env: 'TEST_KEY', default: 'default' }
			}
			const env = new envModule.Env(schema)
			expect(env.get('testKey')).toBe('test_value')
		})
	})

	test('Env constructor with nested schema (multiple levels)', async () => {
		await withFreshEnv({ envVars: { DISCORD_TOKEN: 'token123' } }, async (envModule) => {
			const schema = {
				discord: {
					token: { env: 'DISCORD_TOKEN', default: '' }
				}
			}
			const env = new envModule.Env(schema)
			expect(env.get('discord.token')).toBe('token123')
		})
	})

	test('Env constructor with schema containing default values', async () => {
		await withFreshEnv({}, async (envModule) => {
			const schema = {
				test: { env: 'TEST_UNDEFINED', default: 'default_value' }
			}
			const env = new envModule.Env(schema)
			expect(env.get('test')).toBe('default_value')
		})
	})

	test('Env constructor with schema containing only env keys (no defaults)', async () => {
		await withFreshEnv({ envVars: { TEST_KEY: 'value' } }, async (envModule) => {
			const schema = {
				test: { env: 'TEST_KEY' }
			}
			const env = new envModule.Env(schema)
			expect(env.get('test')).toBe('value')
		})
	})

	test('Env constructor with empty schema object', async () => {
		await withFreshEnv({}, async (envModule) => {
			const env = new envModule.Env({})
			expect(env).toBeDefined()
		})
	})

	test('Env constructor preserves schema structure for later access', async () => {
		await withFreshEnv({}, async (envModule) => {
			const schema = {
				level1: {
					level2: { env: 'TEST', default: 'value' }
				}
			}
			const env = new envModule.Env(schema)
			expect(env).toBeDefined()
		})
	})

	test('multiple Env instances can coexist with different schemas', async () => {
		await withFreshEnv({ envVars: { KEY1: 'value1', KEY2: 'value2' } }, async (envModule) => {
			const schema1 = { key1: { env: 'KEY1' } }
			const schema2 = { key2: { env: 'KEY2' } }
			const env1 = new envModule.Env(schema1)
			const env2 = new envModule.Env(schema2)
			expect(env1.get('key1')).toBe('value1')
			expect(env2.get('key2')).toBe('value2')
		})
	})

	test('Env instance is independent of static methods', async () => {
		await withFreshEnv({}, async (envModule) => {
			const schema = { test: { env: 'TEST', default: 'value' } }
			const env = new envModule.Env(schema)
			expect(env).toBeDefined()
			expect(envModule.Env.data()).toBeUndefined()
		})
	})

	test('exported env constant is pre-configured Env instance with default schema', async () => {
		await withFreshEnv({}, async (envModule) => {
			expect(envModule.env).toBeDefined()
			expect(typeof envModule.env.get).toBe('function')
		})
	})
})

describe('Get method with dot notation and defaults', () => {
	// Dot notation path traversal
	test('get() with single-level key returns environment variable value', async () => {
		await withFreshEnv({ envVars: { TEST_KEY: 'test_value' } }, async (envModule) => {
			const schema = { testKey: { env: 'TEST_KEY' } }
			const env = new envModule.Env(schema)
			expect(env.get('testKey')).toBe('test_value')
		})
	})

	test('get() with two-level dot notation', async () => {
		await withFreshEnv({ envVars: { DISCORD_TOKEN: 'token123' } }, async (envModule) => {
			const schema = {
				discord: {
					token: { env: 'DISCORD_TOKEN' }
				}
			}
			const env = new envModule.Env(schema)
			expect(env.get('discord.token')).toBe('token123')
		})
	})

	test('get() with three-level dot notation', async () => {
		await withFreshEnv({ envVars: { ROBOPLAY_API_URL: 'https://api.roboplay.dev' } }, async (envModule) => {
			const schema = {
				roboplay: {
					api: {
						url: { env: 'ROBOPLAY_API_URL' }
					}
				}
			}
			const env = new envModule.Env(schema)
			expect(env.get('roboplay.api.url')).toBe('https://api.roboplay.dev')
		})
	})

	test('get() with deep nesting (4+ levels)', async () => {
		await withFreshEnv({ envVars: { DEEP_VALUE: 'deep' } }, async (envModule) => {
			const schema = {
				level1: {
					level2: {
						level3: {
							level4: { env: 'DEEP_VALUE' }
						}
					}
				}
			}
			const env = new envModule.Env(schema)
			expect(env.get('level1.level2.level3.level4')).toBe('deep')
		})
	})

	test('get() returns value from process.env when variable is set', async () => {
		await withFreshEnv({ envVars: { MY_VAR: 'my_value' } }, async (envModule) => {
			const schema = { myVar: { env: 'MY_VAR' } }
			const env = new envModule.Env(schema)
			expect(env.get('myVar')).toBe('my_value')
		})
	})

	test('get() returns undefined when environment variable not set and no default', async () => {
		await withFreshEnv({}, async (envModule) => {
			const schema = { testKey: { env: 'UNDEFINED_VAR' } }
			const env = new envModule.Env(schema)
			expect(env.get('testKey')).toBeUndefined()
		})
	})

	test('get() returns default value when environment variable not set', async () => {
		await withFreshEnv({}, async (envModule) => {
			const schema = { testKey: { env: 'UNDEFINED_VAR', default: 'default_value' } }
			const env = new envModule.Env(schema)
			expect(env.get('testKey')).toBe('default_value')
		})
	})

	test('get() prefers process.env value over default when both exist', async () => {
		await withFreshEnv({ envVars: { TEST_VAR: 'env_value' } }, async (envModule) => {
			const schema = { testVar: { env: 'TEST_VAR', default: 'default_value' } }
			const env = new envModule.Env(schema)
			expect(env.get('testVar')).toBe('env_value')
		})
	})

	test('get() with invalid key path throws Error', async () => {
		await withFreshEnv({}, async (envModule) => {
			const schema = { testKey: { env: 'TEST' } }
			const env = new envModule.Env(schema)
			expect(() => env.get('nonexistent')).toThrow()
		})
	})

	test('get() with non-existent intermediate key throws Error', async () => {
		await withFreshEnv({}, async (envModule) => {
			const schema = { testKey: { env: 'TEST' } }
			const env = new envModule.Env(schema)
			expect(() => env.get('testKey.nonexistent')).toThrow()
		})
	})

	test('get() with key pointing to non-leaf node throws Error', async () => {
		await withFreshEnv({}, async (envModule) => {
			const schema = {
				nested: {
					value: { env: 'TEST' }
				}
			}
			const env = new envModule.Env(schema)
			expect(() => env.get('nested')).toThrow()
		})
	})

	// Type safety and edge cases
	test('get() returns string values correctly', async () => {
		await withFreshEnv({ envVars: { STRING_VAR: 'hello world' } }, async (envModule) => {
			const schema = { stringVar: { env: 'STRING_VAR' } }
			const env = new envModule.Env(schema)
			expect(typeof env.get('stringVar')).toBe('string')
			expect(env.get('stringVar')).toBe('hello world')
		})
	})

	test('get() handles empty string values', async () => {
		await withFreshEnv({ envVars: { EMPTY_VAR: '' } }, async (envModule) => {
			const schema = { emptyVar: { env: 'EMPTY_VAR' } }
			const env = new envModule.Env(schema)
			expect(env.get('emptyVar')).toBe('')
		})
	})

	test('get() handles numeric string values', async () => {
		await withFreshEnv({ envVars: { NUMERIC_VAR: '12345' } }, async (envModule) => {
			const schema = { numericVar: { env: 'NUMERIC_VAR' } }
			const env = new envModule.Env(schema)
			expect(env.get('numericVar')).toBe('12345')
		})
	})

	test('get() handles boolean string values', async () => {
		await withFreshEnv({ envVars: { BOOL_VAR: 'true' } }, async (envModule) => {
			const schema = { boolVar: { env: 'BOOL_VAR' } }
			const env = new envModule.Env(schema)
			expect(env.get('boolVar')).toBe('true')
		})
	})

	test('get() handles special characters in values', async () => {
		await withFreshEnv({ envVars: { SPECIAL_VAR: '!@#$%^&*()' } }, async (envModule) => {
			const schema = { specialVar: { env: 'SPECIAL_VAR' } }
			const env = new envModule.Env(schema)
			expect(env.get('specialVar')).toBe('!@#$%^&*()')
		})
	})

	test('get() handles unicode characters in values', async () => {
		await withFreshEnv({ envVars: { UNICODE_VAR: '你好🌍' } }, async (envModule) => {
			const schema = { unicodeVar: { env: 'UNICODE_VAR' } }
			const env = new envModule.Env(schema)
			expect(env.get('unicodeVar')).toBe('你好🌍')
		})
	})

	test('get() with schema missing env property throws Error', async () => {
		await withFreshEnv({}, async (envModule) => {
			const schema = { testKey: {} as any }
			const env = new envModule.Env(schema)
			expect(() => env.get('testKey')).toThrow()
		})
	})

	test('get() with null schema value throws Error', async () => {
		await withFreshEnv({}, async (envModule) => {
			const schema = { testKey: null as any }
			const env = new envModule.Env(schema)
			expect(() => env.get('testKey')).toThrow()
		})
	})

	test('get() with undefined schema value throws Error', async () => {
		await withFreshEnv({}, async (envModule) => {
			const schema = { testKey: undefined as any }
			const env = new envModule.Env(schema)
			expect(() => env.get('testKey')).toThrow()
		})
	})
})

describe('Static data() method', () => {
	test('Env.data() returns undefined before any load operation', async () => {
		await withFreshEnv({}, async (envModule) => {
			expect(envModule.Env.data()).toBeUndefined()
		})
	})

	test('Env.data() returns loaded environment variables after load()', async () => {
		const tempFile = await createTempEnvFile('.env', 'TEST_KEY=test_value')
		await withFreshEnv({}, async (envModule) => {
			await envModule.Env.load({ path: tempFile })
			const data = envModule.Env.data()
			expect(data).toEqual({ TEST_KEY: 'test_value' })
		})
	})

	test('Env.data() returns loaded environment variables after loadSync()', async () => {
		const tempFile = await createTempEnvFile('.env', 'TEST_KEY=test_value')
		await withFreshEnv({}, async (envModule) => {
			envModule.Env.loadSync({ path: tempFile })
			const data = envModule.Env.data()
			expect(data).toEqual({ TEST_KEY: 'test_value' })
		})
	})

	test('Env.data() returns object with all parsed key-value pairs', async () => {
		const tempFile = await createTempEnvFile('.env', 'KEY1=value1\nKEY2=value2\nKEY3=value3')
		await withFreshEnv({}, async (envModule) => {
			await envModule.Env.load({ path: tempFile })
			const data = envModule.Env.data()
			expect(data).toEqual({ KEY1: 'value1', KEY2: 'value2', KEY3: 'value3' })
		})
	})

	test('Env.data() persists across multiple calls', async () => {
		const tempFile = await createTempEnvFile('.env', 'TEST_KEY=test_value')
		await withFreshEnv({}, async (envModule) => {
			await envModule.Env.load({ path: tempFile })
			const data1 = envModule.Env.data()
			const data2 = envModule.Env.data()
			expect(data1).toEqual(data2)
		})
	})

	test('Env.data() updates when load() is called again', async () => {
		const tempFile1 = await createTempEnvFile('.env1', 'KEY1=value1')
		const tempFile2 = await createTempEnvFile('.env2', 'KEY2=value2')
		await withFreshEnv({}, async (envModule) => {
			await envModule.Env.load({ path: tempFile1 })
			expect(envModule.Env.data()).toEqual({ KEY1: 'value1' })
			await envModule.Env.load({ path: tempFile2 })
			expect(envModule.Env.data()).toEqual({ KEY2: 'value2' })
		})
	})

	test('Env.data() returns same reference (not a copy)', async () => {
		const tempFile = await createTempEnvFile('.env', 'TEST_KEY=test_value')
		await withFreshEnv({}, async (envModule) => {
			await envModule.Env.load({ path: tempFile })
			const data1 = envModule.Env.data()
			const data2 = envModule.Env.data()
			expect(data1).toBe(data2)
		})
	})

	test('Env.data() is shared across all Env instances (static)', async () => {
		const tempFile = await createTempEnvFile('.env', 'TEST_KEY=test_value')
		await withFreshEnv({}, async (envModule) => {
			await envModule.Env.load({ path: tempFile })
			const schema1 = { key1: { env: 'KEY1' } }
			const schema2 = { key2: { env: 'KEY2' } }
			const env1 = new envModule.Env(schema1)
			const env2 = new envModule.Env(schema2)
			expect(envModule.Env.data()).toEqual({ TEST_KEY: 'test_value' })
		})
	})

	test('Env.data() returns empty object when file does not exist', async () => {
		await withFreshEnv({}, async (envModule) => {
			await envModule.Env.load({ path: '/nonexistent/.env' })
			expect(envModule.Env.data()).toEqual({})
		})
	})

	test('Env.data() returns empty object when Bun runtime detected', async () => {
		await withFreshEnv({ mockBunRuntime: true }, async (envModule) => {
			await envModule.Env.load()
			expect(envModule.Env.data()).toEqual({})
		})
	})
})

describe('Async load() method', () => {
	// Basic loading
	test('load() reads file content and parses key-value pairs', async () => {
		const tempFile = await createTempEnvFile('.env', 'TEST_KEY=test_value\nANOTHER_KEY=another_value')
		await withFreshEnv({}, async (envModule) => {
			const result = await envModule.Env.load({ path: tempFile })
			expect(result).toEqual({ TEST_KEY: 'test_value', ANOTHER_KEY: 'another_value' })
		})
	})

	test('load() applies parsed variables to process.env', async () => {
		const tempFile = await createTempEnvFile('.env', 'TEST_KEY=test_value')
		await withFreshEnv({}, async (envModule) => {
			await envModule.Env.load({ path: tempFile })
			expect(process.env.TEST_KEY).toBe('test_value')
		})
	})

	test('load() stores result in Env._data accessible via data()', async () => {
		const tempFile = await createTempEnvFile('.env', 'TEST_KEY=test_value')
		await withFreshEnv({}, async (envModule) => {
			await envModule.Env.load({ path: tempFile })
			expect(envModule.Env.data()).toEqual({ TEST_KEY: 'test_value' })
		})
	})

	test('load() returns empty object when file does not exist', async () => {
		await withFreshEnv({}, async (envModule) => {
			const result = await envModule.Env.load({ path: '/nonexistent/.env' })
			expect(result).toEqual({})
		})
	})

	test('load() with custom path option loads from specified file', async () => {
		const tempFile = await createTempEnvFile('custom.env', 'CUSTOM_KEY=custom_value')
		await withFreshEnv({}, async (envModule) => {
			const result = await envModule.Env.load({ path: tempFile })
			expect(result).toEqual({ CUSTOM_KEY: 'custom_value' })
		})
	})

	test('load() with absolute path works correctly', async () => {
		const tempFile = await createTempEnvFile('.env', 'ABS_KEY=abs_value')
		await withFreshEnv({}, async (envModule) => {
			const result = await envModule.Env.load({ path: tempFile })
			expect(result).toEqual({ ABS_KEY: 'abs_value' })
		})
	})

	test('load() with relative path resolves from cwd', async () => {
		const tempFile = await createTempEnvFile('.env', 'REL_KEY=rel_value')
		const originalCwd = process.cwd()
		process.chdir(TEMP_ENV_DIR)
		await withFreshEnv({}, async (envModule) => {
			const result = await envModule.Env.load({ path: '.env' })
			expect(result).toEqual({ REL_KEY: 'rel_value' })
		})
		process.chdir(originalCwd)
	})

	// Mode-specific loading
	test('load({ mode: "dev" }) looks for .env.dev first', async () => {
		const tempFileDev = await createTempEnvFile('.env.dev', 'DEV_KEY=dev_value')
		const originalCwd = process.cwd()
		process.chdir(TEMP_ENV_DIR)
		await withFreshEnv({}, async (envModule) => {
			const result = await envModule.Env.load({ mode: 'dev' })
			expect(result).toEqual({ DEV_KEY: 'dev_value' })
		})
		process.chdir(originalCwd)
	})

	test('load({ mode: "prod" }) looks for .env.prod first', async () => {
		const tempFileProd = await createTempEnvFile('.env.prod', 'PROD_KEY=prod_value')
		const originalCwd = process.cwd()
		process.chdir(TEMP_ENV_DIR)
		await withFreshEnv({}, async (envModule) => {
			const result = await envModule.Env.load({ mode: 'prod' })
			expect(result).toEqual({ PROD_KEY: 'prod_value' })
		})
		process.chdir(originalCwd)
	})

	test('load({ mode: "test" }) looks for .env.test first', async () => {
		const tempFileTest = await createTempEnvFile('.env.test', 'TEST_MODE_KEY=test_value')
		const originalCwd = process.cwd()
		process.chdir(TEMP_ENV_DIR)
		await withFreshEnv({}, async (envModule) => {
			const result = await envModule.Env.load({ mode: 'test' })
			expect(result).toEqual({ TEST_MODE_KEY: 'test_value' })
		})
		process.chdir(originalCwd)
	})

	test('load() with mode falls back to .env if mode-specific file does not exist', async () => {
		const tempFile = await createTempEnvFile('.env', 'FALLBACK_KEY=fallback_value')
		const originalCwd = process.cwd()
		process.chdir(TEMP_ENV_DIR)
		await withFreshEnv({}, async (envModule) => {
			const result = await envModule.Env.load({ mode: 'dev' })
			expect(result).toEqual({ FALLBACK_KEY: 'fallback_value' })
		})
		process.chdir(originalCwd)
	})

	test('load() with mode uses mode file when both .env and .env.{mode} exist', async () => {
		await createTempEnvFile('.env', 'KEY=default_value')
		await createTempEnvFile('.env.dev', 'KEY=dev_value')
		const originalCwd = process.cwd()
		process.chdir(TEMP_ENV_DIR)
		await withFreshEnv({}, async (envModule) => {
			const result = await envModule.Env.load({ mode: 'dev' })
			expect(result).toEqual({ KEY: 'dev_value' })
		})
		process.chdir(originalCwd)
	})

	// Overwrite behavior
	test('load() by default does not overwrite existing process.env variables', async () => {
		const tempFile = await createTempEnvFile('.env', 'EXISTING_KEY=new_value')
		await withFreshEnv({ envVars: { EXISTING_KEY: 'existing_value' } }, async (envModule) => {
			await envModule.Env.load({ path: tempFile })
			expect(process.env.EXISTING_KEY).toBe('existing_value')
		})
	})

	test('load({ overwrite: true }) overwrites all existing variables', async () => {
		const tempFile = await createTempEnvFile('.env', 'EXISTING_KEY=new_value')
		await withFreshEnv({ envVars: { EXISTING_KEY: 'existing_value' } }, async (envModule) => {
			await envModule.Env.load({ path: tempFile, overwrite: true })
			expect(process.env.EXISTING_KEY).toBe('new_value')
		})
	})

	test('load({ overwrite: false }) does not overwrite any existing variables', async () => {
		const tempFile = await createTempEnvFile('.env', 'EXISTING_KEY=new_value')
		await withFreshEnv({ envVars: { EXISTING_KEY: 'existing_value' } }, async (envModule) => {
			await envModule.Env.load({ path: tempFile, overwrite: false })
			expect(process.env.EXISTING_KEY).toBe('existing_value')
		})
	})

	test('load({ overwrite: ["KEY1", "KEY2"] }) only overwrites specified keys', async () => {
		const tempFile = await createTempEnvFile('.env', 'KEY1=new1\nKEY2=new2\nKEY3=new3')
		await withFreshEnv({ envVars: { KEY1: 'old1', KEY2: 'old2', KEY3: 'old3' } }, async (envModule) => {
			await envModule.Env.load({ path: tempFile, overwrite: ['KEY1', 'KEY2'] })
			expect(process.env.KEY1).toBe('new1')
			expect(process.env.KEY2).toBe('new2')
			expect(process.env.KEY3).toBe('old3')
		})
	})

	test('load() with overwrite array does not overwrite non-specified keys', async () => {
		const tempFile = await createTempEnvFile('.env', 'KEY1=new1\nKEY2=new2')
		await withFreshEnv({ envVars: { KEY1: 'old1', KEY2: 'old2' } }, async (envModule) => {
			await envModule.Env.load({ path: tempFile, overwrite: ['KEY1'] })
			expect(process.env.KEY1).toBe('new1')
			expect(process.env.KEY2).toBe('old2')
		})
	})

	test('load() respects global overwrites set via setGlobalOverwrites()', async () => {
		const tempFile = await createTempEnvFile('.env', 'KEY1=new1\nKEY2=new2')
		await withFreshEnv({ envVars: { KEY1: 'old1', KEY2: 'old2' } }, async (envModule) => {
			envModule.setGlobalOverwrites(['KEY1'])
			await envModule.Env.load({ path: tempFile })
			expect(process.env.KEY1).toBe('new1')
			expect(process.env.KEY2).toBe('old2')
		})
	})

	test('load() with explicit overwrite option takes precedence over global overwrites', async () => {
		const tempFile = await createTempEnvFile('.env', 'KEY1=new1\nKEY2=new2')
		await withFreshEnv({ envVars: { KEY1: 'old1', KEY2: 'old2' } }, async (envModule) => {
			envModule.setGlobalOverwrites(['KEY1'])
			await envModule.Env.load({ path: tempFile, overwrite: ['KEY2'] })
			expect(process.env.KEY1).toBe('old1')
			expect(process.env.KEY2).toBe('new2')
		})
	})

	// Error handling
	test('load() catches and logs errors during file reading', async () => {
		await withFreshEnv({}, async (envModule) => {
			const result = await envModule.Env.load({ path: '/invalid/path/.env' })
			expect(result).toEqual({})
		})
	})

	test('load() returns empty object on error', async () => {
		await withFreshEnv({}, async (envModule) => {
			const result = await envModule.Env.load({ path: '/nonexistent/.env' })
			expect(result).toEqual({})
		})
	})

	test('load() does not crash on malformed .env file', async () => {
		const tempFile = await createTempEnvFile('.env', 'MALFORMED\nKEY=value')
		await withFreshEnv({}, async (envModule) => {
			const result = await envModule.Env.load({ path: tempFile })
			expect(result).toHaveProperty('KEY', 'value')
		})
	})
})

describe('Sync loadSync() method', () => {
	// Basic loading
	test('loadSync() reads file content and parses key-value pairs', async () => {
		const tempFile = await createTempEnvFile('.env', 'TEST_KEY=test_value\nANOTHER_KEY=another_value')
		await withFreshEnv({}, async (envModule) => {
			const result = envModule.Env.loadSync({ path: tempFile })
			expect(result).toEqual({ TEST_KEY: 'test_value', ANOTHER_KEY: 'another_value' })
		})
	})

	test('loadSync() applies parsed variables to process.env', async () => {
		const tempFile = await createTempEnvFile('.env', 'TEST_KEY=test_value')
		await withFreshEnv({}, async (envModule) => {
			envModule.Env.loadSync({ path: tempFile })
			expect(process.env.TEST_KEY).toBe('test_value')
		})
	})

	test('loadSync() stores result in Env._data accessible via data()', async () => {
		const tempFile = await createTempEnvFile('.env', 'TEST_KEY=test_value')
		await withFreshEnv({}, async (envModule) => {
			envModule.Env.loadSync({ path: tempFile })
			expect(envModule.Env.data()).toEqual({ TEST_KEY: 'test_value' })
		})
	})

	test('loadSync() returns empty object when file does not exist', async () => {
		await withFreshEnv({}, async (envModule) => {
			const result = envModule.Env.loadSync({ path: '/nonexistent/.env' })
			expect(result).toEqual({})
		})
	})

	test('loadSync() with custom path option loads from specified file', async () => {
		const tempFile = await createTempEnvFile('custom.env', 'CUSTOM_KEY=custom_value')
		await withFreshEnv({}, async (envModule) => {
			const result = envModule.Env.loadSync({ path: tempFile })
			expect(result).toEqual({ CUSTOM_KEY: 'custom_value' })
		})
	})

	test('loadSync() blocks execution (synchronous behavior)', async () => {
		const tempFile = await createTempEnvFile('.env', 'SYNC_KEY=sync_value')
		await withFreshEnv({}, async (envModule) => {
			let executed = false
			envModule.Env.loadSync({ path: tempFile })
			executed = true
			expect(executed).toBe(true)
			expect(envModule.Env.data()).toEqual({ SYNC_KEY: 'sync_value' })
		})
	})

	// Mode-specific loading
	test('loadSync({ mode: "dev" }) looks for .env.dev first', async () => {
		const tempFileDev = await createTempEnvFile('.env.dev', 'DEV_KEY=dev_value')
		const originalCwd = process.cwd()
		process.chdir(TEMP_ENV_DIR)
		await withFreshEnv({}, async (envModule) => {
			const result = envModule.Env.loadSync({ mode: 'dev' })
			expect(result).toEqual({ DEV_KEY: 'dev_value' })
		})
		process.chdir(originalCwd)
	})

	test('loadSync({ mode: "prod" }) looks for .env.prod first', async () => {
		const tempFileProd = await createTempEnvFile('.env.prod', 'PROD_KEY=prod_value')
		const originalCwd = process.cwd()
		process.chdir(TEMP_ENV_DIR)
		await withFreshEnv({}, async (envModule) => {
			const result = envModule.Env.loadSync({ mode: 'prod' })
			expect(result).toEqual({ PROD_KEY: 'prod_value' })
		})
		process.chdir(originalCwd)
	})

	test('loadSync() with mode falls back to .env if mode-specific file does not exist', async () => {
		const tempFile = await createTempEnvFile('.env', 'FALLBACK_KEY=fallback_value')
		const originalCwd = process.cwd()
		process.chdir(TEMP_ENV_DIR)
		await withFreshEnv({}, async (envModule) => {
			const result = envModule.Env.loadSync({ mode: 'dev' })
			expect(result).toEqual({ FALLBACK_KEY: 'fallback_value' })
		})
		process.chdir(originalCwd)
	})

	// Overwrite behavior
	test('loadSync() by default does not overwrite existing process.env variables', async () => {
		const tempFile = await createTempEnvFile('.env', 'EXISTING_KEY=new_value')
		await withFreshEnv({ envVars: { EXISTING_KEY: 'existing_value' } }, async (envModule) => {
			envModule.Env.loadSync({ path: tempFile })
			expect(process.env.EXISTING_KEY).toBe('existing_value')
		})
	})

	test('loadSync({ overwrite: true }) overwrites all existing variables', async () => {
		const tempFile = await createTempEnvFile('.env', 'EXISTING_KEY=new_value')
		await withFreshEnv({ envVars: { EXISTING_KEY: 'existing_value' } }, async (envModule) => {
			envModule.Env.loadSync({ path: tempFile, overwrite: true })
			expect(process.env.EXISTING_KEY).toBe('new_value')
		})
	})

	test('loadSync({ overwrite: ["KEY1"] }) only overwrites specified keys', async () => {
		const tempFile = await createTempEnvFile('.env', 'KEY1=new1\nKEY2=new2')
		await withFreshEnv({ envVars: { KEY1: 'old1', KEY2: 'old2' } }, async (envModule) => {
			envModule.Env.loadSync({ path: tempFile, overwrite: ['KEY1'] })
			expect(process.env.KEY1).toBe('new1')
			expect(process.env.KEY2).toBe('old2')
		})
	})

	test('loadSync() respects global overwrites set via setGlobalOverwrites()', async () => {
		const tempFile = await createTempEnvFile('.env', 'KEY1=new1\nKEY2=new2')
		await withFreshEnv({ envVars: { KEY1: 'old1', KEY2: 'old2' } }, async (envModule) => {
			envModule.setGlobalOverwrites(['KEY1'])
			envModule.Env.loadSync({ path: tempFile })
			expect(process.env.KEY1).toBe('new1')
			expect(process.env.KEY2).toBe('old2')
		})
	})

	// Error handling
	test('loadSync() catches and logs errors during file reading', async () => {
		await withFreshEnv({}, async (envModule) => {
			const result = envModule.Env.loadSync({ path: '/invalid/path/.env' })
			expect(result).toEqual({})
		})
	})

	test('loadSync() returns empty object on error', async () => {
		await withFreshEnv({}, async (envModule) => {
			const result = envModule.Env.loadSync({ path: '/nonexistent/.env' })
			expect(result).toEqual({})
		})
	})

	// Comparison with async load()
	test('loadSync() and load() produce identical results for same file', async () => {
		const tempFile = await createTempEnvFile('.env', 'KEY1=value1\nKEY2=value2')
		await withFreshEnv({}, async (envModule) => {
			const syncResult = envModule.Env.loadSync({ path: tempFile })
			const asyncResult = await envModule.Env.load({ path: tempFile })
			expect(syncResult).toEqual(asyncResult)
		})
	})

	test('loadSync() and load() both update Env._data', async () => {
		const tempFile1 = await createTempEnvFile('.env1', 'KEY1=value1')
		const tempFile2 = await createTempEnvFile('.env2', 'KEY2=value2')
		await withFreshEnv({}, async (envModule) => {
			envModule.Env.loadSync({ path: tempFile1 })
			expect(envModule.Env.data()).toEqual({ KEY1: 'value1' })
			await envModule.Env.load({ path: tempFile2 })
			expect(envModule.Env.data()).toEqual({ KEY2: 'value2' })
		})
	})

	test('loadSync() and load() both apply to process.env identically', async () => {
		const tempFile1 = await createTempEnvFile('.env1', 'KEY1=value1')
		const tempFile2 = await createTempEnvFile('.env2', 'KEY2=value2')
		await withFreshEnv({}, async (envModule) => {
			envModule.Env.loadSync({ path: tempFile1 })
			expect(process.env.KEY1).toBe('value1')
			await envModule.Env.load({ path: tempFile2 })
			expect(process.env.KEY2).toBe('value2')
		})
	})
})

describe('Variable substitution (${VAR_NAME}) and circular reference detection', () => {
	// Basic substitution
	test('${VAR_NAME} syntax substitutes from process.env', async () => {
		const tempFile = await createTempEnvFile('.env', 'NEW_VAR=${EXISTING_VAR}')
		await withFreshEnv({ envVars: { EXISTING_VAR: 'existing_value' } }, async (envModule) => {
			await envModule.Env.load({ path: tempFile, overwrite: true })
			expect(process.env.NEW_VAR).toBe('existing_value')
		})
	})

	test('${VAR_NAME} syntax substitutes from newly loaded variables', async () => {
		const tempFile = await createTempEnvFile('.env', 'VAR1=value1\nVAR2=${VAR1}')
		await withFreshEnv({}, async (envModule) => {
			await envModule.Env.load({ path: tempFile })
			expect(process.env.VAR2).toBe('value1')
		})
	})

	test('multiple ${VAR} references in single value', async () => {
		const tempFile = await createTempEnvFile('.env', 'VAR1=hello\nVAR2=world\nVAR3=${VAR1}_${VAR2}')
		await withFreshEnv({}, async (envModule) => {
			await envModule.Env.load({ path: tempFile })
			expect(process.env.VAR3).toBe('hello_world')
		})
	})

	test('nested substitution (VAR1=${VAR2}, VAR2=${VAR3})', async () => {
		const tempFile = await createTempEnvFile('.env', 'VAR3=value3\nVAR2=${VAR3}\nVAR1=${VAR2}')
		await withFreshEnv({}, async (envModule) => {
			await envModule.Env.load({ path: tempFile })
			expect(process.env.VAR1).toBe('value3')
		})
	})

	test('substitution with empty variable resolves to empty string', async () => {
		const tempFile = await createTempEnvFile('.env', 'EMPTY_VAR=\nNEW_VAR=${EMPTY_VAR}')
		await withFreshEnv({}, async (envModule) => {
			await envModule.Env.load({ path: tempFile })
			expect(process.env.NEW_VAR).toBe('')
		})
	})

	test('substitution with undefined variable resolves to empty string', async () => {
		const tempFile = await createTempEnvFile('.env', 'NEW_VAR=${UNDEFINED_VAR}')
		await withFreshEnv({}, async (envModule) => {
			await envModule.Env.load({ path: tempFile })
			expect(process.env.NEW_VAR).toBe('')
		})
	})

	test('substitution preserves surrounding text', async () => {
		const tempFile = await createTempEnvFile('.env', 'VAR1=middle\nVAR2=prefix_${VAR1}_suffix')
		await withFreshEnv({}, async (envModule) => {
			await envModule.Env.load({ path: tempFile })
			expect(process.env.VAR2).toBe('prefix_middle_suffix')
		})
	})

	test('substitution works with numeric values', async () => {
		const tempFile = await createTempEnvFile('.env', 'VAR1=12345\nVAR2=${VAR1}')
		await withFreshEnv({}, async (envModule) => {
			await envModule.Env.load({ path: tempFile })
			expect(process.env.VAR2).toBe('12345')
		})
	})

	test('substitution works with special characters', async () => {
		const tempFile = await createTempEnvFile('.env', 'VAR1=!@#$%\nVAR2=${VAR1}')
		await withFreshEnv({}, async (envModule) => {
			await envModule.Env.load({ path: tempFile })
			expect(process.env.VAR2).toBe('!@#$%')
		})
	})

	test('substitution is case-sensitive', async () => {
		const tempFile = await createTempEnvFile('.env', 'var1=lowercase\nVAR1=uppercase\nVAR2=${var1}\nVAR3=${VAR1}')
		await withFreshEnv({}, async (envModule) => {
			await envModule.Env.load({ path: tempFile })
			expect(process.env.VAR2).toBe('lowercase')
			expect(process.env.VAR3).toBe('uppercase')
		})
	})

	// Circular reference detection
	test('circular reference (VAR1=${VAR2}, VAR2=${VAR1}) throws Error', async () => {
		const tempFile = await createTempEnvFile('.env', 'VAR1=${VAR2}\nVAR2=${VAR1}')
		await withFreshEnv({}, async (envModule) => {
			const result = await envModule.Env.load({ path: tempFile })
			// Should return empty object due to circular reference error
			expect(result).toEqual({})
		})
	})

	test('self-reference (VAR=${VAR}) throws Error', async () => {
		const tempFile = await createTempEnvFile('.env', 'VAR=${VAR}')
		await withFreshEnv({}, async (envModule) => {
			const result = await envModule.Env.load({ path: tempFile })
			expect(result).toEqual({})
		})
	})

	test('circular reference in chain (VAR1=${VAR2}, VAR2=${VAR3}, VAR3=${VAR1}) throws Error', async () => {
		const tempFile = await createTempEnvFile('.env', 'VAR1=${VAR2}\nVAR2=${VAR3}\nVAR3=${VAR1}')
		await withFreshEnv({}, async (envModule) => {
			const result = await envModule.Env.load({ path: tempFile })
			expect(result).toEqual({})
		})
	})

	test('circular reference error does not corrupt process.env', async () => {
		const tempFile = await createTempEnvFile('.env', 'VAR1=${VAR2}\nVAR2=${VAR1}')
		await withFreshEnv({ envVars: { SAFE_VAR: 'safe_value' } }, async (envModule) => {
			await envModule.Env.load({ path: tempFile })
			expect(process.env.SAFE_VAR).toBe('safe_value')
		})
	})

	test('circular reference error stops processing and returns empty result', async () => {
		const tempFile = await createTempEnvFile('.env', 'VAR1=${VAR2}\nVAR2=${VAR1}\nVAR3=value3')
		await withFreshEnv({}, async (envModule) => {
			const result = await envModule.Env.load({ path: tempFile })
			expect(result).toEqual({})
		})
	})

	// Edge cases
	test('substitution with malformed syntax (missing closing brace) leaves text unchanged', async () => {
		const tempFile = await createTempEnvFile('.env', 'VAR1=${VAR2')
		await withFreshEnv({}, async (envModule) => {
			await envModule.Env.load({ path: tempFile })
			expect(process.env.VAR1).toBe('${VAR2')
		})
	})

	test('substitution with empty braces ${} leaves text unchanged', async () => {
		const tempFile = await createTempEnvFile('.env', 'VAR1=${}')
		await withFreshEnv({}, async (envModule) => {
			await envModule.Env.load({ path: tempFile })
			expect(process.env.VAR1).toBe('${}')
		})
	})

	test('substitution with spaces ${ VAR } does not match', async () => {
		const tempFile = await createTempEnvFile('.env', 'VAR1=value1\nVAR2=${ VAR1 }')
		await withFreshEnv({}, async (envModule) => {
			await envModule.Env.load({ path: tempFile })
			expect(process.env.VAR2).toBe('${ VAR1 }')
		})
	})

	test('substitution with nested braces ${${VAR}} does not work', async () => {
		const tempFile = await createTempEnvFile('.env', 'VAR1=value1\nVAR2=${${VAR1}}')
		await withFreshEnv({}, async (envModule) => {
			await envModule.Env.load({ path: tempFile })
			// Should leave it as-is since nested braces are not supported
			expect(process.env.VAR2).toContain('${')
		})
	})
})

describe('.env file parsing (comments, multiline, quotes, escaping)', () => {
	// Basic parsing
	test('parseEnvFile() extracts simple KEY=VALUE pairs', async () => {
		const tempFile = await createTempEnvFile('.env', 'KEY=VALUE')
		await withFreshEnv({}, async (envModule) => {
			const result = await envModule.Env.load({ path: tempFile })
			expect(result).toEqual({ KEY: 'VALUE' })
		})
	})

	test('parseEnvFile() handles multiple lines', async () => {
		const tempFile = await createTempEnvFile('.env', 'KEY1=VALUE1\nKEY2=VALUE2\nKEY3=VALUE3')
		await withFreshEnv({}, async (envModule) => {
			const result = await envModule.Env.load({ path: tempFile })
			expect(result).toEqual({ KEY1: 'VALUE1', KEY2: 'VALUE2', KEY3: 'VALUE3' })
		})
	})

	test('parseEnvFile() trims whitespace around keys', async () => {
		const tempFile = await createTempEnvFile('.env', '  KEY  =VALUE')
		await withFreshEnv({}, async (envModule) => {
			const result = await envModule.Env.load({ path: tempFile })
			expect(result).toEqual({ KEY: 'VALUE' })
		})
	})

	test('parseEnvFile() trims whitespace around values', async () => {
		const tempFile = await createTempEnvFile('.env', 'KEY=  VALUE  ')
		await withFreshEnv({}, async (envModule) => {
			const result = await envModule.Env.load({ path: tempFile })
			expect(result).toEqual({ KEY: 'VALUE' })
		})
	})

	test('parseEnvFile() handles empty lines', async () => {
		const tempFile = await createTempEnvFile('.env', 'KEY1=VALUE1\n\n\nKEY2=VALUE2')
		await withFreshEnv({}, async (envModule) => {
			const result = await envModule.Env.load({ path: tempFile })
			expect(result).toEqual({ KEY1: 'VALUE1', KEY2: 'VALUE2' })
		})
	})

	test('parseEnvFile() handles values with equals signs', async () => {
		const tempFile = await createTempEnvFile('.env', 'KEY=VALUE=MORE')
		await withFreshEnv({}, async (envModule) => {
			const result = await envModule.Env.load({ path: tempFile })
			expect(result).toEqual({ KEY: 'VALUE=MORE' })
		})
	})

	test('parseEnvFile() uses first equals sign as delimiter', async () => {
		const tempFile = await createTempEnvFile('.env', 'KEY=VALUE1=VALUE2=VALUE3')
		await withFreshEnv({}, async (envModule) => {
			const result = await envModule.Env.load({ path: tempFile })
			expect(result).toEqual({ KEY: 'VALUE1=VALUE2=VALUE3' })
		})
	})

	test('parseEnvFile() handles keys with underscores and numbers', async () => {
		const tempFile = await createTempEnvFile('.env', 'KEY_1=VALUE\nKEY_2_TEST=VALUE2')
		await withFreshEnv({}, async (envModule) => {
			const result = await envModule.Env.load({ path: tempFile })
			expect(result).toEqual({ KEY_1: 'VALUE', KEY_2_TEST: 'VALUE2' })
		})
	})

	test('parseEnvFile() handles uppercase and lowercase keys', async () => {
		const tempFile = await createTempEnvFile('.env', 'UPPERCASE=VALUE\nlowercase=value')
		await withFreshEnv({}, async (envModule) => {
			const result = await envModule.Env.load({ path: tempFile })
			expect(result).toEqual({ UPPERCASE: 'VALUE', lowercase: 'value' })
		})
	})

	// Comment handling
	test('parseEnvFile() ignores lines starting with #', async () => {
		const tempFile = await createTempEnvFile('.env', '# This is a comment\nKEY=VALUE')
		await withFreshEnv({}, async (envModule) => {
			const result = await envModule.Env.load({ path: tempFile })
			expect(result).toEqual({ KEY: 'VALUE' })
		})
	})

	test('parseEnvFile() ignores lines starting with # after whitespace', async () => {
		const tempFile = await createTempEnvFile('.env', '   # This is a comment\nKEY=VALUE')
		await withFreshEnv({}, async (envModule) => {
			const result = await envModule.Env.load({ path: tempFile })
			expect(result).toEqual({ KEY: 'VALUE' })
		})
	})

	test('parseEnvFile() does not treat # in middle of line as comment', async () => {
		const tempFile = await createTempEnvFile('.env', 'KEY=VALUE#NOTACOMMENT')
		await withFreshEnv({}, async (envModule) => {
			const result = await envModule.Env.load({ path: tempFile })
			expect(result.KEY).toContain('#')
		})
	})

	test('parseEnvFile() handles empty comment lines', async () => {
		const tempFile = await createTempEnvFile('.env', '#\nKEY=VALUE')
		await withFreshEnv({}, async (envModule) => {
			const result = await envModule.Env.load({ path: tempFile })
			expect(result).toEqual({ KEY: 'VALUE' })
		})
	})

	test('parseEnvFile() handles multiple consecutive comment lines', async () => {
		const tempFile = await createTempEnvFile('.env', '# Comment 1\n# Comment 2\n# Comment 3\nKEY=VALUE')
		await withFreshEnv({}, async (envModule) => {
			const result = await envModule.Env.load({ path: tempFile })
			expect(result).toEqual({ KEY: 'VALUE' })
		})
	})

	// Multiline support
	test('parseEnvFile() handles backslash continuation', async () => {
		const tempFile = await createTempEnvFile('.env', 'KEY=VALUE\\\nCONTINUED')
		await withFreshEnv({}, async (envModule) => {
			const result = await envModule.Env.load({ path: tempFile })
			expect(result.KEY).toContain('VALUE')
			expect(result.KEY).toContain('CONTINUED')
		})
	})

	test('parseEnvFile() concatenates multiline values correctly', async () => {
		const tempFile = await createTempEnvFile('.env', 'KEY=LINE1\\\nLINE2')
		await withFreshEnv({}, async (envModule) => {
			const result = await envModule.Env.load({ path: tempFile })
			expect(result.KEY).toBeTruthy()
		})
	})

	test('parseEnvFile() handles multiple consecutive continuations', async () => {
		const tempFile = await createTempEnvFile('.env', 'KEY=LINE1\\\nLINE2\\\nLINE3')
		await withFreshEnv({}, async (envModule) => {
			const result = await envModule.Env.load({ path: tempFile })
			expect(result.KEY).toBeTruthy()
		})
	})

	// Quote handling
	test('parseEnvFile() removes surrounding single quotes', async () => {
		const tempFile = await createTempEnvFile('.env', "KEY='VALUE'")
		await withFreshEnv({}, async (envModule) => {
			const result = await envModule.Env.load({ path: tempFile })
			expect(result).toEqual({ KEY: 'VALUE' })
		})
	})

	test('parseEnvFile() removes surrounding double quotes', async () => {
		const tempFile = await createTempEnvFile('.env', 'KEY="VALUE"')
		await withFreshEnv({}, async (envModule) => {
			const result = await envModule.Env.load({ path: tempFile })
			expect(result).toEqual({ KEY: 'VALUE' })
		})
	})

	test('parseEnvFile() does not remove quotes from middle of value', async () => {
		const tempFile = await createTempEnvFile('.env', 'KEY=VAL"UE')
		await withFreshEnv({}, async (envModule) => {
			const result = await envModule.Env.load({ path: tempFile })
			expect(result.KEY).toContain('"')
		})
	})

	test('parseEnvFile() handles empty quoted strings', async () => {
		const tempFile = await createTempEnvFile('.env', 'KEY=""')
		await withFreshEnv({}, async (envModule) => {
			const result = await envModule.Env.load({ path: tempFile })
			expect(result).toEqual({ KEY: '' })
		})
	})

	test('parseEnvFile() handles quotes with spaces inside', async () => {
		const tempFile = await createTempEnvFile('.env', 'KEY="VALUE WITH SPACES"')
		await withFreshEnv({}, async (envModule) => {
			const result = await envModule.Env.load({ path: tempFile })
			expect(result).toEqual({ KEY: 'VALUE WITH SPACES' })
		})
	})

	// Escape sequence handling
	test('parseEnvFile() unescapes \\n to newline in quoted strings', async () => {
		const tempFile = await createTempEnvFile('.env', 'KEY="LINE1\\nLINE2"')
		await withFreshEnv({}, async (envModule) => {
			const result = await envModule.Env.load({ path: tempFile })
			expect(result.KEY).toContain('\n')
		})
	})

	test('parseEnvFile() unescapes \\t to tab in quoted strings', async () => {
		const tempFile = await createTempEnvFile('.env', 'KEY="VALUE\\tTAB"')
		await withFreshEnv({}, async (envModule) => {
			const result = await envModule.Env.load({ path: tempFile })
			expect(result.KEY).toContain('\t')
		})
	})

	test('parseEnvFile() unescapes \\" to double quote in quoted strings', async () => {
		const tempFile = await createTempEnvFile('.env', 'KEY="VALUE\\"QUOTE"')
		await withFreshEnv({}, async (envModule) => {
			const result = await envModule.Env.load({ path: tempFile })
			expect(result.KEY).toContain('"')
		})
	})

	test('parseEnvFile() unescapes \\\\ to backslash in quoted strings', async () => {
		const tempFile = await createTempEnvFile('.env', 'KEY="VALUE\\\\BACKSLASH"')
		await withFreshEnv({}, async (envModule) => {
			const result = await envModule.Env.load({ path: tempFile })
			expect(result.KEY).toContain('\\')
		})
	})

	// Edge cases
	test('parseEnvFile() handles lines without equals sign (ignores them)', async () => {
		const tempFile = await createTempEnvFile('.env', 'INVALID_LINE\nKEY=VALUE')
		await withFreshEnv({}, async (envModule) => {
			const result = await envModule.Env.load({ path: tempFile })
			expect(result).toEqual({ KEY: 'VALUE' })
		})
	})

	test('parseEnvFile() handles keys without values (empty string value)', async () => {
		const tempFile = await createTempEnvFile('.env', 'KEY=')
		await withFreshEnv({}, async (envModule) => {
			const result = await envModule.Env.load({ path: tempFile })
			expect(result).toEqual({ KEY: '' })
		})
	})

	test('parseEnvFile() handles values with special characters', async () => {
		const tempFile = await createTempEnvFile('.env', 'KEY=!@#$%^&*()')
		await withFreshEnv({}, async (envModule) => {
			const result = await envModule.Env.load({ path: tempFile })
			expect(result).toEqual({ KEY: '!@#$%^&*()' })
		})
	})

	test('parseEnvFile() handles unicode characters in keys and values', async () => {
		const tempFile = await createTempEnvFile('.env', 'KEY=你好🌍')
		await withFreshEnv({}, async (envModule) => {
			const result = await envModule.Env.load({ path: tempFile })
			expect(result).toEqual({ KEY: '你好🌍' })
		})
	})

	test('parseEnvFile() handles Windows line endings (\\r\\n)', async () => {
		const tempFile = await createTempEnvFile('.env', 'KEY1=VALUE1\r\nKEY2=VALUE2')
		await withFreshEnv({}, async (envModule) => {
			const result = await envModule.Env.load({ path: tempFile })
			expect(result).toEqual({ KEY1: 'VALUE1', KEY2: 'VALUE2' })
		})
	})

	test('parseEnvFile() handles mixed line endings', async () => {
		const tempFile = await createTempEnvFile('.env', 'KEY1=VALUE1\nKEY2=VALUE2\r\nKEY3=VALUE3')
		await withFreshEnv({}, async (envModule) => {
			const result = await envModule.Env.load({ path: tempFile })
			expect(result).toEqual({ KEY1: 'VALUE1', KEY2: 'VALUE2', KEY3: 'VALUE3' })
		})
	})

	test('parseEnvFile() returns empty object for empty file content', async () => {
		const tempFile = await createTempEnvFile('.env', '')
		await withFreshEnv({}, async (envModule) => {
			const result = await envModule.Env.load({ path: tempFile })
			expect(result).toEqual({})
		})
	})

	test('parseEnvFile() returns empty object for file with only comments', async () => {
		const tempFile = await createTempEnvFile('.env', '# Comment 1\n# Comment 2\n# Comment 3')
		await withFreshEnv({}, async (envModule) => {
			const result = await envModule.Env.load({ path: tempFile })
			expect(result).toEqual({})
		})
	})
})

describe('Global overwrites with setGlobalOverwrites()', () => {
	test('setGlobalOverwrites() sets global overwrite array', async () => {
		await withFreshEnv({}, async (envModule) => {
			envModule.setGlobalOverwrites(['KEY1'])
			expect(() => envModule.setGlobalOverwrites(['KEY1'])).not.toThrow()
		})
	})

	test('setGlobalOverwrites() affects subsequent load() calls', async () => {
		const tempFile = await createTempEnvFile('.env', 'KEY1=new_value')
		await withFreshEnv({ envVars: { KEY1: 'old_value' } }, async (envModule) => {
			envModule.setGlobalOverwrites(['KEY1'])
			await envModule.Env.load({ path: tempFile })
			expect(process.env.KEY1).toBe('new_value')
		})
	})

	test('setGlobalOverwrites() affects subsequent loadSync() calls', async () => {
		const tempFile = await createTempEnvFile('.env', 'KEY1=new_value')
		await withFreshEnv({ envVars: { KEY1: 'old_value' } }, async (envModule) => {
			envModule.setGlobalOverwrites(['KEY1'])
			envModule.Env.loadSync({ path: tempFile })
			expect(process.env.KEY1).toBe('new_value')
		})
	})

	test('setGlobalOverwrites(["KEY1"]) causes KEY1 to be overwritten by default', async () => {
		const tempFile = await createTempEnvFile('.env', 'KEY1=new_value\nKEY2=new_value2')
		await withFreshEnv({ envVars: { KEY1: 'old_value', KEY2: 'old_value2' } }, async (envModule) => {
			envModule.setGlobalOverwrites(['KEY1'])
			await envModule.Env.load({ path: tempFile })
			expect(process.env.KEY1).toBe('new_value')
			expect(process.env.KEY2).toBe('old_value2')
		})
	})

	test('setGlobalOverwrites(["KEY1", "KEY2"]) causes multiple keys to be overwritten', async () => {
		const tempFile = await createTempEnvFile('.env', 'KEY1=new1\nKEY2=new2')
		await withFreshEnv({ envVars: { KEY1: 'old1', KEY2: 'old2' } }, async (envModule) => {
			envModule.setGlobalOverwrites(['KEY1', 'KEY2'])
			await envModule.Env.load({ path: tempFile })
			expect(process.env.KEY1).toBe('new1')
			expect(process.env.KEY2).toBe('new2')
		})
	})

	test('setGlobalOverwrites([]) clears global overwrites', async () => {
		const tempFile = await createTempEnvFile('.env', 'KEY1=new_value')
		await withFreshEnv({ envVars: { KEY1: 'old_value' } }, async (envModule) => {
			envModule.setGlobalOverwrites(['KEY1'])
			envModule.setGlobalOverwrites([])
			await envModule.Env.load({ path: tempFile })
			expect(process.env.KEY1).toBe('old_value')
		})
	})

	test('setGlobalOverwrites() persists across multiple load operations', async () => {
		const tempFile1 = await createTempEnvFile('.env1', 'KEY1=new1')
		const tempFile2 = await createTempEnvFile('.env2', 'KEY1=new2')
		await withFreshEnv({ envVars: { KEY1: 'old' } }, async (envModule) => {
			envModule.setGlobalOverwrites(['KEY1'])
			await envModule.Env.load({ path: tempFile1 })
			expect(process.env.KEY1).toBe('new1')
			await envModule.Env.load({ path: tempFile2 })
			expect(process.env.KEY1).toBe('new2')
		})
	})

	test('explicit overwrite option in load() overrides global overwrites', async () => {
		const tempFile = await createTempEnvFile('.env', 'KEY1=new1\nKEY2=new2')
		await withFreshEnv({ envVars: { KEY1: 'old1', KEY2: 'old2' } }, async (envModule) => {
			envModule.setGlobalOverwrites(['KEY1'])
			await envModule.Env.load({ path: tempFile, overwrite: ['KEY2'] })
			expect(process.env.KEY1).toBe('old1')
			expect(process.env.KEY2).toBe('new2')
		})
	})

	test('load({ overwrite: false }) ignores global overwrites', async () => {
		const tempFile = await createTempEnvFile('.env', 'KEY1=new_value')
		await withFreshEnv({ envVars: { KEY1: 'old_value' } }, async (envModule) => {
			envModule.setGlobalOverwrites(['KEY1'])
			await envModule.Env.load({ path: tempFile, overwrite: false })
			expect(process.env.KEY1).toBe('old_value')
		})
	})

	test('load({ overwrite: true }) overwrites all regardless of global overwrites', async () => {
		const tempFile = await createTempEnvFile('.env', 'KEY1=new1\nKEY2=new2')
		await withFreshEnv({ envVars: { KEY1: 'old1', KEY2: 'old2' } }, async (envModule) => {
			envModule.setGlobalOverwrites(['KEY1'])
			await envModule.Env.load({ path: tempFile, overwrite: true })
			expect(process.env.KEY1).toBe('new1')
			expect(process.env.KEY2).toBe('new2')
		})
	})

	test('load({ overwrite: ["KEY3"] }) uses specified array instead of global', async () => {
		const tempFile = await createTempEnvFile('.env', 'KEY1=new1\nKEY3=new3')
		await withFreshEnv({ envVars: { KEY1: 'old1', KEY3: 'old3' } }, async (envModule) => {
			envModule.setGlobalOverwrites(['KEY1'])
			await envModule.Env.load({ path: tempFile, overwrite: ['KEY3'] })
			expect(process.env.KEY1).toBe('old1')
			expect(process.env.KEY3).toBe('new3')
		})
	})

	test('setGlobalOverwrites() is module-level state (affects all instances)', async () => {
		const tempFile = await createTempEnvFile('.env', 'KEY1=new_value')
		await withFreshEnv({ envVars: { KEY1: 'old_value' } }, async (envModule) => {
			envModule.setGlobalOverwrites(['KEY1'])
			await envModule.Env.load({ path: tempFile })
			expect(process.env.KEY1).toBe('new_value')
		})
	})

	test('setGlobalOverwrites() with empty array restores default behavior', async () => {
		const tempFile = await createTempEnvFile('.env', 'KEY1=new_value')
		await withFreshEnv({ envVars: { KEY1: 'old_value' } }, async (envModule) => {
			envModule.setGlobalOverwrites(['KEY1'])
			envModule.setGlobalOverwrites([])
			await envModule.Env.load({ path: tempFile })
			expect(process.env.KEY1).toBe('old_value')
		})
	})
})

describe('Bun runtime detection', () => {
	test('load() returns empty object when IS_BUN_RUNTIME is true', async () => {
		await withFreshEnv({ mockBunRuntime: true }, async (envModule) => {
			const result = await envModule.Env.load()
			expect(result).toEqual({})
		})
	})

	test('loadSync() returns empty object when IS_BUN_RUNTIME is true', async () => {
		await withFreshEnv({ mockBunRuntime: true }, async (envModule) => {
			const result = envModule.Env.loadSync()
			expect(result).toEqual({})
		})
	})

	test('load() does not attempt file read when IS_BUN_RUNTIME is true', async () => {
		await withFreshEnv({ mockBunRuntime: true }, async (envModule) => {
			const result = await envModule.Env.load({ path: '/some/path/.env' })
			expect(result).toEqual({})
		})
	})

	test('loadSync() does not attempt file read when IS_BUN_RUNTIME is true', async () => {
		await withFreshEnv({ mockBunRuntime: true }, async (envModule) => {
			const result = envModule.Env.loadSync({ path: '/some/path/.env' })
			expect(result).toEqual({})
		})
	})

	test('load() with mode returns empty when IS_BUN_RUNTIME is true', async () => {
		await withFreshEnv({ mockBunRuntime: true }, async (envModule) => {
			const result = await envModule.Env.load({ mode: 'dev' })
			expect(result).toEqual({})
		})
	})

	test('loadSync() with mode returns empty when IS_BUN_RUNTIME is true', async () => {
		await withFreshEnv({ mockBunRuntime: true }, async (envModule) => {
			const result = envModule.Env.loadSync({ mode: 'dev' })
			expect(result).toEqual({})
		})
	})

	test('Bun runtime detection happens before mode-specific file check', async () => {
		await withFreshEnv({ mockBunRuntime: true }, async (envModule) => {
			const result = await envModule.Env.load({ mode: 'prod' })
			expect(result).toEqual({})
		})
	})

	test('Bun runtime detection happens before path resolution', async () => {
		await withFreshEnv({ mockBunRuntime: true }, async (envModule) => {
			const result = await envModule.Env.load({ path: '/custom/path/.env' })
			expect(result).toEqual({})
		})
	})
})

describe('Missing file handling and error cases', () => {
	// File not found
	test('load() returns empty object when .env file does not exist', async () => {
		await withFreshEnv({}, async (envModule) => {
			const result = await envModule.Env.load({ path: '/nonexistent/.env' })
			expect(result).toEqual({})
		})
	})

	test('loadSync() returns empty object when .env file does not exist', async () => {
		await withFreshEnv({}, async (envModule) => {
			const result = envModule.Env.loadSync({ path: '/nonexistent/.env' })
			expect(result).toEqual({})
		})
	})

	test('load() with mode returns empty object when neither .env nor .env.{mode} exist', async () => {
		const originalCwd = process.cwd()
		process.chdir(TEMP_ENV_DIR)
		await withFreshEnv({}, async (envModule) => {
			const result = await envModule.Env.load({ mode: 'dev' })
			expect(result).toEqual({})
		})
		process.chdir(originalCwd)
	})

	test('load() does not throw error when file missing', async () => {
		await withFreshEnv({}, async (envModule) => {
			await expect(envModule.Env.load({ path: '/nonexistent/.env' })).resolves.toEqual({})
		})
	})

	test('loadSync() does not throw error when file missing', async () => {
		await withFreshEnv({}, async (envModule) => {
			expect(() => envModule.Env.loadSync({ path: '/nonexistent/.env' })).not.toThrow()
		})
	})

	// File read errors
	test('load() with permission error logs error and returns empty object', async () => {
		await withFreshEnv({}, async (envModule) => {
			const result = await envModule.Env.load({ path: '/root/.env' })
			expect(result).toEqual({})
		})
	})

	test('loadSync() with permission error logs error and returns empty object', async () => {
		await withFreshEnv({}, async (envModule) => {
			const result = envModule.Env.loadSync({ path: '/root/.env' })
			expect(result).toEqual({})
		})
	})

	// Parsing errors
	test('load() with malformed .env content does not crash', async () => {
		const tempFile = await createTempEnvFile('.env', '\x00\x01\x02')
		await withFreshEnv({}, async (envModule) => {
			await expect(envModule.Env.load({ path: tempFile })).resolves.toBeDefined()
		})
	})

	test('loadSync() with malformed .env content does not crash', async () => {
		const tempFile = await createTempEnvFile('.env', '\x00\x01\x02')
		await withFreshEnv({}, async (envModule) => {
			expect(() => envModule.Env.loadSync({ path: tempFile })).not.toThrow()
		})
	})
})

describe('Integration scenarios with temporary files', () => {
	// End-to-end scenarios
	test('create temporary .env file, load() it, verify process.env updated', async () => {
		const tempFile = await createTempEnvFile('.env', 'INTEGRATION_KEY=integration_value')
		await withFreshEnv({}, async (envModule) => {
			await envModule.Env.load({ path: tempFile })
			expect(process.env.INTEGRATION_KEY).toBe('integration_value')
		})
	})

	test('create temporary .env.dev file, load({ mode: "dev" }), verify correct file loaded', async () => {
		const tempFileDev = await createTempEnvFile('.env.dev', 'DEV_INTEGRATION=dev_value')
		const originalCwd = process.cwd()
		process.chdir(TEMP_ENV_DIR)
		await withFreshEnv({}, async (envModule) => {
			await envModule.Env.load({ mode: 'dev' })
			expect(process.env.DEV_INTEGRATION).toBe('dev_value')
		})
		process.chdir(originalCwd)
	})

	test('create both .env and .env.prod, load({ mode: "prod" }), verify .env.prod takes precedence', async () => {
		await createTempEnvFile('.env', 'PRECEDENCE_KEY=default_value')
		await createTempEnvFile('.env.prod', 'PRECEDENCE_KEY=prod_value')
		const originalCwd = process.cwd()
		process.chdir(TEMP_ENV_DIR)
		await withFreshEnv({}, async (envModule) => {
			await envModule.Env.load({ mode: 'prod' })
			expect(process.env.PRECEDENCE_KEY).toBe('prod_value')
		})
		process.chdir(originalCwd)
	})

	test('load() with variable substitution from real file', async () => {
		const tempFile = await createTempEnvFile('.env', 'BASE=base_value\nDERIVED=${BASE}_derived')
		await withFreshEnv({}, async (envModule) => {
			await envModule.Env.load({ path: tempFile })
			expect(process.env.DERIVED).toBe('base_value_derived')
		})
	})

	test('load() with multiline values from real file', async () => {
		const tempFile = await createTempEnvFile('.env', 'MULTILINE=line1\\\nline2')
		await withFreshEnv({}, async (envModule) => {
			await envModule.Env.load({ path: tempFile })
			expect(process.env.MULTILINE).toBeTruthy()
		})
	})

	test('load() with comments and quotes from real file', async () => {
		const tempFile = await createTempEnvFile('.env', '# Comment\nQUOTED="quoted value"')
		await withFreshEnv({}, async (envModule) => {
			await envModule.Env.load({ path: tempFile })
			expect(process.env.QUOTED).toBe('quoted value')
		})
	})

	test('loadSync() with real file produces same result as load()', async () => {
		const tempFile = await createTempEnvFile('.env', 'SYNC_TEST=sync_value')
		await withFreshEnv({}, async (envModule) => {
			const syncResult = envModule.Env.loadSync({ path: tempFile })
			const asyncResult = await envModule.Env.load({ path: tempFile })
			expect(syncResult).toEqual(asyncResult)
		})
	})

	test('multiple load() calls with different files update Env._data correctly', async () => {
		const tempFile1 = await createTempEnvFile('.env1', 'KEY1=value1')
		const tempFile2 = await createTempEnvFile('.env2', 'KEY2=value2')
		await withFreshEnv({}, async (envModule) => {
			await envModule.Env.load({ path: tempFile1 })
			expect(envModule.Env.data()).toEqual({ KEY1: 'value1' })
			await envModule.Env.load({ path: tempFile2 })
			expect(envModule.Env.data()).toEqual({ KEY2: 'value2' })
		})
	})

	test('Env instance get() method works with loaded variables', async () => {
		const tempFile = await createTempEnvFile('.env', 'GET_TEST=get_value')
		await withFreshEnv({}, async (envModule) => {
			await envModule.Env.load({ path: tempFile })
			const schema = { getTest: { env: 'GET_TEST' } }
			const env = new envModule.Env(schema)
			expect(env.get('getTest')).toBe('get_value')
		})
	})

	test('exported env constant works with loaded variables', async () => {
		const tempFile = await createTempEnvFile('.env', 'ENV_CONSTANT_TEST=constant_value')
		await withFreshEnv({}, async (envModule) => {
			await envModule.Env.load({ path: tempFile })
			expect(process.env.ENV_CONSTANT_TEST).toBe('constant_value')
		})
	})

	// Complex .env file scenarios
	test('real .env file with mix of simple values, quotes, multiline, comments, and substitution', async () => {
		const content = `# Configuration file
SIMPLE=simple_value
QUOTED="quoted value"
BASE=base
SUBSTITUTED=\${BASE}_extended
# Another comment
MULTILINE=line1\\
line2
SPECIAL=!@#$%^&*()`
		const tempFile = await createTempEnvFile('.env', content)
		await withFreshEnv({}, async (envModule) => {
			await envModule.Env.load({ path: tempFile })
			expect(process.env.SIMPLE).toBe('simple_value')
			expect(process.env.QUOTED).toBe('quoted value')
			expect(process.env.SUBSTITUTED).toBe('base_extended')
			expect(process.env.SPECIAL).toBe('!@#$%^&*()')
		})
	})

	test('real .env file with all supported features combined', async () => {
		const content = `# Header comment
KEY1=value1
KEY2="value 2"
KEY3='value 3'
BASE_URL=https://api.example.com
API_URL=\${BASE_URL}/v1
# Multiline test
DESCRIPTION=This is a\\
multiline\\
value
EMPTY=
SPECIAL_CHARS=!@#$%^&*()_+-={}[]|:;"'<>,.?/`
		const tempFile = await createTempEnvFile('.env', content)
		await withFreshEnv({}, async (envModule) => {
			await envModule.Env.load({ path: tempFile })
			expect(process.env.KEY1).toBe('value1')
			expect(process.env.KEY2).toBe('value 2')
			expect(process.env.API_URL).toBe('https://api.example.com/v1')
			expect(process.env.EMPTY).toBe('')
		})
	})

	test('real .env file with edge cases (empty values, special characters, unicode)', async () => {
		const content = `EMPTY=
UNICODE=你好🌍
EMOJI=🚀💻🎉
SPECIAL=<>&"'`
		const tempFile = await createTempEnvFile('.env', content)
		await withFreshEnv({}, async (envModule) => {
			await envModule.Env.load({ path: tempFile })
			expect(process.env.EMPTY).toBe('')
			expect(process.env.UNICODE).toBe('你好🌍')
			expect(process.env.EMOJI).toBe('🚀💻🎉')
		})
	})

	test('loading multiple mode-specific files in sequence', async () => {
		await createTempEnvFile('.env.dev', 'MODE=dev')
		await createTempEnvFile('.env.prod', 'MODE=prod')
		const originalCwd = process.cwd()
		process.chdir(TEMP_ENV_DIR)
		await withFreshEnv({}, async (envModule) => {
			await envModule.Env.load({ mode: 'dev' })
			expect(process.env.MODE).toBe('dev')
			await envModule.Env.load({ mode: 'prod', overwrite: true })
			expect(process.env.MODE).toBe('prod')
		})
		process.chdir(originalCwd)
	})

	test('overwrite behavior with real files and existing process.env', async () => {
		const tempFile = await createTempEnvFile('.env', 'EXISTING=new_value\nNEW=value')
		await withFreshEnv({ envVars: { EXISTING: 'old_value' } }, async (envModule) => {
			await envModule.Env.load({ path: tempFile })
			expect(process.env.EXISTING).toBe('old_value')
			expect(process.env.NEW).toBe('value')
			await envModule.Env.load({ path: tempFile, overwrite: true })
			expect(process.env.EXISTING).toBe('new_value')
		})
	})
})

describe('Edge cases and stress tests', () => {
	// Concurrent operations
	test('multiple concurrent load() calls do not corrupt Env._data', async () => {
		const tempFile1 = await createTempEnvFile('.env1', 'KEY1=value1')
		const tempFile2 = await createTempEnvFile('.env2', 'KEY2=value2')
		await withFreshEnv({}, async (envModule) => {
			await Promise.all([
				envModule.Env.load({ path: tempFile1 }),
				envModule.Env.load({ path: tempFile2 })
			])
			const data = envModule.Env.data()
			expect(data).toBeDefined()
		})
	})

	test('load() and loadSync() called concurrently do not interfere', async () => {
		const tempFile1 = await createTempEnvFile('.env1', 'KEY1=value1')
		const tempFile2 = await createTempEnvFile('.env2', 'KEY2=value2')
		await withFreshEnv({}, async (envModule) => {
			const results = await Promise.all([
				envModule.Env.load({ path: tempFile1 }),
				Promise.resolve(envModule.Env.loadSync({ path: tempFile2 }))
			])
			expect(results).toHaveLength(2)
		})
	})

	test('multiple Env instances with get() calls work correctly', async () => {
		await withFreshEnv({ envVars: { KEY1: 'value1', KEY2: 'value2' } }, async (envModule) => {
			const schema1 = { key1: { env: 'KEY1' } }
			const schema2 = { key2: { env: 'KEY2' } }
			const env1 = new envModule.Env(schema1)
			const env2 = new envModule.Env(schema2)
			expect(env1.get('key1')).toBe('value1')
			expect(env2.get('key2')).toBe('value2')
		})
	})

	// Large data
	test('load() with very large .env file (1000+ variables)', async () => {
		const lines = []
		for (let i = 0; i < 1000; i++) {
			lines.push(`KEY_${i}=value_${i}`)
		}
		const tempFile = await createTempEnvFile('.env', lines.join('\n'))
		await withFreshEnv({}, async (envModule) => {
			const result = await envModule.Env.load({ path: tempFile })
			expect(Object.keys(result)).toHaveLength(1000)
		})
	})

	test('load() with very long variable values (10KB+ strings)', async () => {
		const longValue = 'x'.repeat(10000)
		const tempFile = await createTempEnvFile('.env', `LONG_VALUE=${longValue}`)
		await withFreshEnv({}, async (envModule) => {
			await envModule.Env.load({ path: tempFile })
			expect(process.env.LONG_VALUE).toHaveLength(10000)
		})
	})

	// Special characters
	test('keys and values with unicode characters (emoji, Chinese, Arabic)', async () => {
		const tempFile = await createTempEnvFile('.env', 'UNICODE=🚀你好مرحبا')
		await withFreshEnv({}, async (envModule) => {
			await envModule.Env.load({ path: tempFile })
			expect(process.env.UNICODE).toBe('🚀你好مرحبا')
		})
	})

	test('keys and values with special characters', async () => {
		const tempFile = await createTempEnvFile('.env', 'SPECIAL=<>&"\'`')
		await withFreshEnv({}, async (envModule) => {
			await envModule.Env.load({ path: tempFile })
			expect(process.env.SPECIAL).toBe('<>&"\'`')
		})
	})

	test('keys and values with newlines in quoted strings', async () => {
		const tempFile = await createTempEnvFile('.env', 'NEWLINE="line1\\nline2"')
		await withFreshEnv({}, async (envModule) => {
			await envModule.Env.load({ path: tempFile })
			expect(process.env.NEWLINE).toContain('\n')
		})
	})

	// Process.env edge cases
	test('load() preserves existing process.env variables not in .env file', async () => {
		const tempFile = await createTempEnvFile('.env', 'NEW_VAR=new_value')
		await withFreshEnv({ envVars: { EXISTING_VAR: 'existing_value' } }, async (envModule) => {
			await envModule.Env.load({ path: tempFile })
			expect(process.env.EXISTING_VAR).toBe('existing_value')
		})
	})

	test('load() with overwrite does not delete existing variables', async () => {
		const tempFile = await createTempEnvFile('.env', 'NEW_VAR=new_value')
		await withFreshEnv({ envVars: { EXISTING_VAR: 'existing_value' } }, async (envModule) => {
			await envModule.Env.load({ path: tempFile, overwrite: true })
			expect(process.env.EXISTING_VAR).toBe('existing_value')
		})
	})

	// Schema edge cases
	test('Env with deeply nested schema (10+ levels)', async () => {
		const schema = {
			l1: { l2: { l3: { l4: { l5: { l6: { l7: { l8: { l9: { l10: { env: 'DEEP_VAR' } } } } } } } } } }
		}
		await withFreshEnv({ envVars: { DEEP_VAR: 'deep_value' } }, async (envModule) => {
			const env = new envModule.Env(schema)
			expect(env.get('l1.l2.l3.l4.l5.l6.l7.l8.l9.l10')).toBe('deep_value')
		})
	})

	// Error recovery
	test('load() error does not prevent subsequent load() calls', async () => {
		const tempFile = await createTempEnvFile('.env', 'KEY=value')
		await withFreshEnv({}, async (envModule) => {
			await envModule.Env.load({ path: '/nonexistent/.env' })
			const result = await envModule.Env.load({ path: tempFile })
			expect(result).toEqual({ KEY: 'value' })
		})
	})

	test('circular reference error does not leave process.env in inconsistent state', async () => {
		const tempFile = await createTempEnvFile('.env', 'VAR1=${VAR2}\nVAR2=${VAR1}')
		await withFreshEnv({ envVars: { SAFE_VAR: 'safe' } }, async (envModule) => {
			await envModule.Env.load({ path: tempFile })
			expect(process.env.SAFE_VAR).toBe('safe')
			expect(process.env.VAR1).toBeUndefined()
		})
	})
})
