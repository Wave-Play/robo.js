/**
 * Jest Configuration for mockbot-activity-ts
 *
 * Supports both unit tests (no mock server) and integration tests (with mock server).
 */
import type { Config } from 'jest'

const config: Config = {
	// Use multiple projects to separate unit and integration tests
	projects: [
		{
			displayName: 'unit',
			testMatch: ['<rootDir>/__tests__/unit/**/*.test.ts'],
			transform: {
				'^.+\\.tsx?$': [
					'ts-jest',
					{
						useESM: true
					}
				]
			},
			extensionsToTreatAsEsm: ['.ts'],
			moduleNameMapper: {
				'^(\\.{1,2}/.*)\\.js$': '$1'
			}
		},
		{
			displayName: 'integration',
			testMatch: ['<rootDir>/__tests__/integration/**/*.test.ts'],
			transform: {
				'^.+\\.tsx?$': [
					'ts-jest',
					{
						useESM: true
					}
				]
			},
			extensionsToTreatAsEsm: ['.ts'],
			moduleNameMapper: {
				'^(\\.{1,2}/.*)\\.js$': '$1'
			}
		},
		{
			displayName: 'hmr',
			testMatch: ['<rootDir>/__tests__/hmr/**/*.test.ts'],
			transform: {
				'^.+\\.tsx?$': [
					'ts-jest',
					{
						useESM: true
					}
				]
			},
			extensionsToTreatAsEsm: ['.ts'],
			moduleNameMapper: {
				'^(\\.{1,2}/.*)\\.js$': '$1'
			}
		}
	],

	// Integration tests must run sequentially (use --runInBand in CLI)
	// Custom reporter for mock server integration
	reporters: ['default', '@robojs/mock/testing/jest-reporter'],

	// Shared settings
	verbose: true,
	testEnvironment: 'node',
	// Longer timeout for integration and HMR tests
	testTimeout: 120000
}

export default config
