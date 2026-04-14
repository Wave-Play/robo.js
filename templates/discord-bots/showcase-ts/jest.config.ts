import type { Config } from 'jest'

const config: Config = {
	reporters: ['default', '@robojs/mock/testing/jest-reporter'],
	testEnvironment: 'node',
	testTimeout: 120_000,
	verbose: true,
	projects: [
		{
			displayName: 'unit',
			extensionsToTreatAsEsm: ['.ts'],
			moduleNameMapper: {
				'^(\\.{1,2}/.*)\\.js$': '$1'
			},
			rootDir: '.',
			testMatch: ['<rootDir>/__tests__/unit/**/*.test.ts'],
			transform: {
				'^.+\\.tsx?$': [
					'ts-jest',
					{
						useESM: true
					}
				]
			}
		},
		{
			displayName: 'integration',
			extensionsToTreatAsEsm: ['.ts'],
			moduleNameMapper: {
				'^(\\.{1,2}/.*)\\.js$': '$1'
			},
			rootDir: '.',
			testMatch: ['<rootDir>/__tests__/integration/**/*.test.ts'],
			transform: {
				'^.+\\.tsx?$': [
					'ts-jest',
					{
						useESM: true
					}
				]
			}
		},
		{
			displayName: 'hmr',
			extensionsToTreatAsEsm: ['.ts'],
			moduleNameMapper: {
				'^(\\.{1,2}/.*)\\.js$': '$1'
			},
			rootDir: '.',
			testMatch: ['<rootDir>/__tests__/hmr/**/*.test.ts'],
			transform: {
				'^.+\\.tsx?$': [
					'ts-jest',
					{
						useESM: true
					}
				]
			}
		}
	]
}

export default config
