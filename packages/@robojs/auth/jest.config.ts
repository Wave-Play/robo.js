import type { Config } from 'jest'

const config: Config = {
	testEnvironment: 'node',
	extensionsToTreatAsEsm: ['.ts'],
	testMatch: ['**/?(*.)+(test).[tj]s?(x)'],
	transform: {
		'^.+\\.ts$': [
			'ts-jest',
			{ useESM: true, isolatedModules: true, tsconfig: { module: 'ESNext', target: 'ES2022', skipLibCheck: true } }
		]
	},
	moduleNameMapper: {
		'^(\\.{1,2}/.*)\\.js$': '$1',
		'^@/(.*)\\.js$': '<rootDir>/src/$1',
		'^@/(.*)$': '<rootDir>/src/$1'
	},
	modulePaths: ['<rootDir>/.robo/build', '<rootDir>/__tests__'],
	transformIgnorePatterns: ['/node_modules/'],
	verbose: true
}

export default config
