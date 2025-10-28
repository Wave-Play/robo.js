import type { Config } from 'jest'

const config: Config = {
	testEnvironment: 'node',
	verbose: true,
	extensionsToTreatAsEsm: ['.ts'],
	setupFilesAfterEnv: ['<rootDir>/__tests__/setup.ts'],
	moduleNameMapper: {
		'^(\\.{1,2}/.*)\\.js$': '$1'
	},
	transform: {
		'^.+\\.ts$': ['ts-jest', { useESM: true, tsconfig: { module: 'ESNext', target: 'ES2022' } }]
	},
	transformIgnorePatterns: ['/node_modules/(?!(messageformat)/)'],
	testPathIgnorePatterns: ['<rootDir>/__typetests__/'],
	watchPathIgnorePatterns: ['<rootDir>/__typetests__/']
}

export default config
