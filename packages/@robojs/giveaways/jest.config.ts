import type { Config } from 'jest'

const config: Config = {
  testEnvironment: 'node',
  verbose: true,
  extensionsToTreatAsEsm: ['.ts'],
  testMatch: ['**/?(*.)+(test).[tj]s?(x)'],
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.ts'],
  transform: {
    '^.+\\.ts?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          module: 'ESNext',
          target: 'ES2022',
          skipLibCheck: true
        }
      }
    ]
  },
  moduleNameMapper: {
    '^robo\\.js$': '<rootDir>/__mocks__/robo.js.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  modulePaths: ['<rootDir>/.robo/build', '<rootDir>/__tests__'],
  testPathIgnorePatterns: ['<rootDir>/.robo/', '<rootDir>/__tests__/fixtures/'],
  watchPathIgnorePatterns: ['<rootDir>/.robo/', '<rootDir>/__tests__/fixtures/']
}

export default config
