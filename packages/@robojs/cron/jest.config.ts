import type { Config } from 'jest'

const config: Config = {
  testEnvironment: 'node',
  verbose: true,
  extensionsToTreatAsEsm: ['.ts'],
  testMatch: ['**/?(*.)+(test).[tj]s?(x)'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        isolatedModules: true,
        tsconfig: {
          module: 'ESNext',
          target: 'ES2022',
          skipLibCheck: true
        }
      }
    ]
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^robo\\.js$': '<rootDir>/../../robo/dist/index.js'
  },
  modulePaths: ['<rootDir>/.robo/build', '<rootDir>/__tests__'],
  testPathIgnorePatterns: ['<rootDir>/.robo/', '<rootDir>/__tests__/fixtures/'],
  watchPathIgnorePatterns: ['<rootDir>/.robo/', '<rootDir>/__tests__/fixtures/']
}

export default config
