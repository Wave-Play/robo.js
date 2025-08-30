// jest.config.ts
import type { Config } from 'jest'

const config: Config = {
	testEnvironment: 'node',
	extensionsToTreatAsEsm: ['.ts'],
	transform: {
		'^.+\\.ts$': ['ts-jest', { useESM: true, tsconfig: { module: 'ESNext', target: 'ES2022' } }]
	},
	// Only strip ".js" from *relative* imports like "./x.js" – leaves "robo.js" alone
	moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
	// Allow ESM in node_modules to load under vm-modules (don’t force-transform them)
	transformIgnorePatterns: ['/node_modules/(?!(messageformat)/)'],
	testPathIgnorePatterns: ['<rootDir>/__typetests__/'],
	watchPathIgnorePatterns: ['<rootDir>/__typetests__/']
}

export default config
