import { promises as fs } from 'fs'
import path from 'node:path'
import { loadConfig, getConfig } from '../src/core/config.js'
import { fileURLToPath } from 'node:url'
// @ts-expect-error - mock
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { logger } from '../src/core/logger.js'

const CURRENT_DIR = fileURLToPath(new URL('.', import.meta.url))
const tempConfigDir = path.join(CURRENT_DIR, '..', 'config')
const tempConfigFile = path.join(tempConfigDir, 'robo.json')

beforeEach(async () => {
	await fs.mkdir(tempConfigDir, { recursive: true })
})

afterEach(async () => {
	try {
		await fs.unlink(tempConfigFile)
	} catch (error) {
		// If the file doesn't exist, do nothing
	}
})

describe('Config Loader', () => {
	it('should return null when no config has been loaded', async () => {
		expect(getConfig()).toBeNull()
	})

	it('should correctly load a .json config file', async () => {
		await fs.writeFile(tempConfigFile, '{"clientOptions": {"intents": ["GREETINGS"]}}')

		const config = await loadConfig('robo')
		expect(config).toEqual({
			clientOptions: {
				intents: ['GREETINGS']
			},
			plugins: []
		})
	})

	it('should return a default configuration when no config file exists', async () => {
		const config = await loadConfig('robo')
		expect(config).toEqual({
			clientOptions: {
				intents: []
			}
		})
	})
})
