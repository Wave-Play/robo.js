import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { logger } from '../../core/logger.js'
import { hasProperties } from './utils.js'

const srcDir = 'src'
const distDir = path.join('.robo', 'build')
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const defaultCommandsDir = path.join(__dirname, '..', '..', 'default', 'commands')
const defaultEventsDir = path.join(__dirname, '..', '..', 'default', 'events')

export async function generateDefaults() {
  try {
    await generateCommands()
    await generateEvents()
  } catch (err) {
    logger.error('Error generating default files', err)
    process.exit(1)
  }
}

async function generateCommands() {
  const defaultFiles = await fs.readdir(defaultCommandsDir)

  for (const file of defaultFiles) {
    const fileExtensionPattern = /\.(ts|tsx|js|jsx)$/

    if (!fileExtensionPattern.test(file)) {
      continue
    }

    const srcPath = path.join(srcDir, 'commands', file)
    const distPath = path.join(distDir, 'commands', file)

    try {
      await fs.access(srcPath)
    } catch (e) {
      if (hasProperties<{ code: unknown }>(e, ['code']) && e.code === 'ENOENT') {
        await fs.mkdir(path.dirname(distPath), { recursive: true })
        await fs.copyFile(path.join(defaultCommandsDir, file), distPath)
      } else {
        throw e
      }
    }
  }
}

async function generateEvents() {
  const defaultFiles = await fs.readdir(defaultEventsDir)

  for (const file of defaultFiles) {
    const fileExtensionPattern = /\.(ts|tsx|js|jsx)$/

    if (!fileExtensionPattern.test(file)) {
      continue
    }

    const distPath = path.join(distDir, 'events', file)
    await fs.mkdir(path.dirname(distPath), { recursive: true })
    await fs.copyFile(path.join(defaultEventsDir, file), distPath)
  }
}
