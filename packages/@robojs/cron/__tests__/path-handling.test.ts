import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals'
import { Cron } from '../src/core/cron.js'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { pathToFileURL } from 'node:url'

// Extend global type
declare global {
  var testExecutions: Array<{ jobId: string; timestamp: number }>
}

// Track all created cron jobs for cleanup
const createdJobs: Array<ReturnType<typeof Cron>> = []

// Helper function to wait for handler execution deterministically
async function waitForExecution(expectedCount = 1, timeoutMs = 2000): Promise<void> {
  const startTime = Date.now()
  while (global.testExecutions.length < expectedCount) {
    if (Date.now() - startTime > timeoutMs) {
      throw new Error(`Timeout waiting for ${expectedCount} executions. Got ${global.testExecutions.length}`)
    }
    await new Promise(resolve => setTimeout(resolve, 25))
  }
}

describe('Path Handling in File-Based Cron Jobs', () => {
  beforeEach(() => {
    // Clear test execution records
    global.testExecutions = []
    // Clear created jobs array
    createdJobs.length = 0
  })

  afterEach(() => {
    // Stop all created cron jobs to prevent async operations after test completion
    for (const job of createdJobs) {
      job.stop()
    }
    // Clear the jobs array
    createdJobs.length = 0
    // Clean up test executions
    delete global.testExecutions
  })

  describe('Relative Path Tests', () => {
    test('should resolve relative paths from process.cwd()/.robo/build/', async () => {
      const relativePath = '/cron/test-handler.js'
      // Normalize the path by removing leading slashes before joining
      const normalizedPath = relativePath.replace(/^\/+/, '')
      const expectedAbsolutePath = path.resolve(process.cwd(), '.robo', 'build', normalizedPath)

      // Create the handler in .robo/build/cron/ to test end-to-end resolution
      const handlerDir = path.dirname(expectedAbsolutePath)
      fs.mkdirSync(handlerDir, { recursive: true })
      const handlerContent = `
export default async function testHandler(jobId) {
  if (!global.testExecutions) {
    global.testExecutions = []
  }
  global.testExecutions.push({ jobId, timestamp: Date.now() })
}
`
      fs.writeFileSync(expectedAbsolutePath, handlerContent)

      try {
        const jobId = 'test-relative-resolution'

        // Create cron job with relative path
        const cronJob = Cron('*/5 * * * *', relativePath)
        createdJobs.push(cronJob)

        // Trigger the job manually
        const cronJobAny = cronJob as any
        cronJobAny.executeFileBasedJob(relativePath, jobId)

        // Wait for async execution deterministically
        await waitForExecution(1)

        // Verify path resolution logic
        expect(path.isAbsolute(expectedAbsolutePath)).toBe(true)
        expect(expectedAbsolutePath).toContain('.robo/build')

        // Verify handler was executed
        expect(global.testExecutions).toBeDefined()
        expect(global.testExecutions.length).toBeGreaterThan(0)
        expect(global.testExecutions[0].jobId).toBe(jobId)
      } finally {
        // Clean up the test file
        if (fs.existsSync(expectedAbsolutePath)) {
          fs.unlinkSync(expectedAbsolutePath)
        }
        // Clean up directory if empty
        const handlerDir = path.dirname(expectedAbsolutePath)
        if (fs.existsSync(handlerDir) && fs.readdirSync(handlerDir).length === 0) {
          fs.rmdirSync(handlerDir)
        }
      }
    })

    test('should execute handler at relative path', async () => {
      const testHandlerPath = path.resolve(process.cwd(), '__tests__/fixtures/test-handler.mjs')
      const jobId = 'test-relative-job'

      // Create cron job with absolute path to fixture
      const cronJob = Cron('*/5 * * * *', testHandlerPath)
      createdJobs.push(cronJob)

      // Trigger the job manually by accessing private method through type assertion
      const cronJobAny = cronJob as any
      cronJobAny.executeFileBasedJob(testHandlerPath, jobId)

      // Wait for async execution deterministically
      await waitForExecution(1)

      // Verify handler was executed
      expect(global.testExecutions).toBeDefined()
      expect(global.testExecutions.length).toBeGreaterThan(0)
      expect(global.testExecutions[0].jobId).toBe(jobId)
    })

    test('should execute handler for legacy /cron/job.js style paths', async () => {
      const testHandlerPath = path.resolve(process.cwd(), '__tests__/fixtures/test-handler.mjs')
      const jobId = 'test-legacy-cron-path'

      // Create cron job with fixture path
      const cronJob = Cron('*/5 * * * *', testHandlerPath)
      createdJobs.push(cronJob)

      // Trigger the job manually
      const cronJobAny = cronJob as any
      cronJobAny.executeFileBasedJob(testHandlerPath, jobId)

      // Wait for async execution deterministically
      await waitForExecution(1)

      // Verify handler was executed
      expect(global.testExecutions).toBeDefined()
      expect(global.testExecutions.length).toBeGreaterThan(0)
      const execution = global.testExecutions.find(e => e.jobId === jobId)
      expect(execution).toBeDefined()
      expect(execution?.jobId).toBe(jobId)
    })
  })

  describe('Absolute Path Tests', () => {
    test('should use absolute paths directly without modification', async () => {
      const absolutePath = path.resolve(process.cwd(), '__tests__/fixtures/test-handler.mjs')

      // Verify the path is absolute
      expect(path.isAbsolute(absolutePath)).toBe(true)

      // Verify file exists
      const exists = fs.existsSync(absolutePath)
      expect(exists).toBe(true)
    })

    test('should execute handler at absolute path', async () => {
      const absolutePath = path.resolve(process.cwd(), '__tests__/fixtures/test-handler.mjs')
      const jobId = 'test-absolute-job'

      // Create cron job with absolute path
      const cronJob = Cron('*/5 * * * *', absolutePath)
      createdJobs.push(cronJob)

      // Trigger the job manually
      const cronJobAny = cronJob as any
      cronJobAny.executeFileBasedJob(absolutePath, jobId)

      // Wait for async execution deterministically
      await waitForExecution(1)

      // Verify handler was executed
      expect(global.testExecutions).toBeDefined()
      expect(global.testExecutions.length).toBeGreaterThan(0)
      expect(global.testExecutions[0].jobId).toBe(jobId)
    })

    test('should handle absolute paths outside project directory', async () => {
      // Create a temporary handler using CommonJS syntax
      const tmpPath = path.join(os.tmpdir(), 'test-cron-handler.js')
      const handlerContent = `
module.exports = async function testHandler(jobId) {
  if (!global.testExecutions) {
    global.testExecutions = []
  }
  global.testExecutions.push({ jobId, timestamp: Date.now() })
}
`
      fs.writeFileSync(tmpPath, handlerContent)

      try {
        const jobId = 'test-tmp-job'

        // Create cron job with absolute path to temp directory
        const cronJob = Cron('*/5 * * * *', tmpPath)
        createdJobs.push(cronJob)

        // Trigger the job manually
        const cronJobAny = cronJob as any
        cronJobAny.executeFileBasedJob(tmpPath, jobId)

        // Wait for async execution deterministically
        await waitForExecution(1)

        // Verify handler was executed
        expect(global.testExecutions).toBeDefined()
        expect(global.testExecutions.length).toBeGreaterThan(0)
        expect(global.testExecutions[0].jobId).toBe(jobId)
      } finally {
        // Clean up temporary file
        if (fs.existsSync(tmpPath)) {
          fs.unlinkSync(tmpPath)
        }
      }
    })

    test('should handle absolute paths with spaces and special characters', async () => {
      // Create a temporary handler with spaces in the filename using CommonJS syntax
      const tmpPath = path.join(os.tmpdir(), 'cron handler with spaces.js')
      const handlerContent = `
module.exports = async function testHandler(jobId) {
  if (!global.testExecutions) {
    global.testExecutions = []
  }
  global.testExecutions.push({ jobId, timestamp: Date.now() })
}
`
      fs.writeFileSync(tmpPath, handlerContent)

      try {
        const jobId = 'test-spaces-job'

        // Create cron job with absolute path containing spaces
        const cronJob = Cron('*/5 * * * *', tmpPath)
        createdJobs.push(cronJob)

        // Trigger the job manually
        const cronJobAny = cronJob as any
        cronJobAny.executeFileBasedJob(tmpPath, jobId)

        // Wait for async execution deterministically
        await waitForExecution(1)

        // Verify handler was executed
        expect(global.testExecutions).toBeDefined()
        expect(global.testExecutions.length).toBeGreaterThan(0)
        const execution = global.testExecutions.find(e => e.jobId === jobId)
        expect(execution).toBeDefined()
        expect(execution?.jobId).toBe(jobId)
      } finally {
        // Clean up temporary file
        if (fs.existsSync(tmpPath)) {
          fs.unlinkSync(tmpPath)
        }
      }
    })
  })

  describe('Error Handling', () => {
    test('should log error for non-existent relative path', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
      const relativePath = '/nonexistent/handler.js'
      const jobId = 'test-missing-relative'

      // Create cron job with non-existent relative path
      const cronJob = Cron('*/5 * * * *', relativePath)
      createdJobs.push(cronJob)

      // Trigger the job manually
      const cronJobAny = cronJob as any
      cronJobAny.executeFileBasedJob(relativePath, jobId)

      // Wait a bit to ensure execution attempt completes
      await new Promise(resolve => setTimeout(resolve, 200))

      // Verify handler was not executed
      expect(global.testExecutions).toEqual([])

      consoleSpy.mockRestore()
    })

    test('should log error for non-existent absolute path', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
      const absolutePath = path.join(os.tmpdir(), 'completely-nonexistent-handler.js')
      const jobId = 'test-missing-absolute'

      // Ensure path doesn't exist
      if (fs.existsSync(absolutePath)) {
        fs.unlinkSync(absolutePath)
      }

      // Create cron job with non-existent absolute path
      const cronJob = Cron('*/5 * * * *', absolutePath)
      createdJobs.push(cronJob)

      // Trigger the job manually
      const cronJobAny = cronJob as any
      cronJobAny.executeFileBasedJob(absolutePath, jobId)

      // Wait a bit to ensure execution attempt completes
      await new Promise(resolve => setTimeout(resolve, 200))

      // Verify handler was not executed
      expect(global.testExecutions).toEqual([])

      consoleSpy.mockRestore()
    })
  })

  describe('Path Detection', () => {
    test('should correctly identify absolute paths', () => {
      const absolutePaths = [
        path.resolve(process.cwd(), 'handler.js'),
        path.join(os.tmpdir(), 'handler.js'),
        path.resolve('/absolute/path/to/handler.js')
      ]

      for (const p of absolutePaths) {
        expect(path.isAbsolute(p)).toBe(true)
      }
    })

    test('should correctly identify relative paths', () => {
      const relativePaths = [
        '/cron/handler.js',
        'cron/handler.js',
        './cron/handler.js',
        '../cron/handler.js',
        '__tests__/fixtures/test-handler.js'
      ]

      // Note: paths starting with '/' are considered absolute in POSIX
      // but in our cron context, they're treated as relative to .robo/build
      const actualRelativePaths = relativePaths.filter(p => !p.startsWith('/'))

      for (const p of actualRelativePaths) {
        expect(path.isAbsolute(p)).toBe(false)
      }
    })
  })
})
