import type { Config } from 'jest'

const config: Config = {
	testEnvironment: 'node',
	extensionsToTreatAsEsm: ['.ts'],
	transform: {
		'^.+\\.ts$': ['ts-jest', { useESM: true, tsconfig: { module: 'ESNext', target: 'ES2022' } }]
	},
	moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
	transformIgnorePatterns: ['/node_modules/(?!(messageformat)/)'],
	testPathIgnorePatterns: ['<rootDir>/__typetests__/'],
	watchPathIgnorePatterns: ['<rootDir>/__typetests__/'],
	verbose: true
}

export default config
