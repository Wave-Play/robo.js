import type { Config } from 'jest'

// Shared ts-jest config that overrides the bundler moduleResolution
const tsJestConfig = {
	useESM: true,
	isolatedModules: true,
	tsconfig: {
		module: 'ESNext',
		target: 'ES2022',
		moduleResolution: 'node',
		skipLibCheck: true,
		esModuleInterop: true
	}
}

const config: Config = {
	testEnvironment: 'node',
	extensionsToTreatAsEsm: ['.ts'],
	testMatch: ['**/?(*.)+(test).[tj]s?(x)'],
	transform: {
		'^.+\\.ts$': ['ts-jest', tsJestConfig]
	},
	moduleNameMapper: {
		'^(\\.{1,2}/.*)\\.js$': '$1',
		'^@/(.*)\\.js$': '<rootDir>/src/$1',
		'^@/(.*)$': '<rootDir>/src/$1',
		'^robo\\.js$': '<rootDir>/__mocks__/robo.js.ts'
	},
	modulePaths: ['<rootDir>/.robo/build', '<rootDir>/__tests__'],
	transformIgnorePatterns: ['/node_modules/'],
	verbose: true,
	// Integration tests run sequentially to share the server instance
	projects: [
		{
			displayName: 'unit',
			testMatch: ['<rootDir>/__tests__/**/*.test.ts'],
			testPathIgnorePatterns: ['<rootDir>/__tests__/integration/'],
			transform: {
				'^.+\\.ts$': ['ts-jest', tsJestConfig]
			},
			moduleNameMapper: {
				'^(\\.{1,2}/.*)\\.js$': '$1',
				'^@/(.*)\\.js$': '<rootDir>/src/$1',
				'^@/(.*)$': '<rootDir>/src/$1',
				'^@robojs/server$': '<rootDir>/__mocks__/robojs-server.ts',
				'^robo\\.js/ipc$': '<rootDir>/__mocks__/robo.js-ipc.ts',
				'^robo\\.js$': '<rootDir>/__mocks__/robo.js.ts'
			}
		},
		{
			displayName: 'integration',
			testMatch: ['<rootDir>/__tests__/integration/**/*.test.ts'],
			transform: {
				'^.+\\.ts$': ['ts-jest', tsJestConfig]
			},
			moduleNameMapper: {
				'^(\\.{1,2}/.*)\\.js$': '$1',
				'^@/(.*)\\.js$': '<rootDir>/src/$1',
				'^@/(.*)$': '<rootDir>/src/$1',
				'^robo\\.js$': '<rootDir>/__mocks__/robo.js.ts'
			},
			globalSetup: '<rootDir>/__tests__/integration/global-setup.js',
			globalTeardown: '<rootDir>/__tests__/integration/global-teardown.js',
			setupFilesAfterEnv: ['<rootDir>/__tests__/integration/test-setup.js']
		}
	]
}

export default config
