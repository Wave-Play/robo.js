/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
	preset: 'ts-jest',
	resolver: 'jest-resolver-enhanced',
	testEnvironment: 'node',
	testMatch: ['**/__tests__/**/*.test.ts']
}
