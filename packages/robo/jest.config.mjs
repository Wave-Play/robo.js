/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
	extensionsToTreatAsEsm: ['.ts'],
	preset: 'ts-jest/presets/default-esm',
	resolver: 'jest-resolver-enhanced',
	testEnvironment: 'node',
	testMatch: ['**/__tests__/**/*.test.ts'],
	transform: {
		'^.+\\.(ts|tsx)$': [
			'ts-jest',
			{
				useESM: true
			}
		]
	}
}
