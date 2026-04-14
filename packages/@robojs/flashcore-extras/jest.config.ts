import type { Config } from 'jest'

const config: Config = {
	testEnvironment: 'node',
	verbose: true,
	extensionsToTreatAsEsm: ['.ts'],
	transform: {
		'^.+\\.ts$': ['ts-jest', { useESM: true, diagnostics: false, tsconfig: { module: 'ESNext', target: 'ES2022' } }]
	},
	moduleNameMapper: {
		'^(\\.{1,2}/.*)\\.js$': '$1',
		'^robo\\.js/flashcore$': '<rootDir>/__tests__/helpers/flashcore-compat.ts',
		'^robo\\.js$': '<rootDir>/__tests__/helpers/__mocks__/robo.js.ts'
	},
	transformIgnorePatterns: ['/node_modules/'],
	testPathIgnorePatterns: ['<rootDir>/__tests__/fixtures/', '<rootDir>/__tests__/helpers/']
}

export default config
