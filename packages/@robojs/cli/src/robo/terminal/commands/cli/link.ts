/**
 * /cli link - Link your CLI for local development.
 *
 * Detects the package manager and runs the appropriate link command
 * so the CLI can be tested with its real name.
 */
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createTerminalCommandConfig } from 'robo.js'
import type { TerminalContext } from 'robo.js'

export const config = createTerminalCommandConfig({
	description: 'Link your CLI for local development'
} as const)

export default async function (ctx: TerminalContext<typeof config>) {
	const pm = getPackageManager()
	const args = pm === 'pnpm' ? ['link', '--global'] : ['link']

	ctx.write(`Running ${pm} ${args.join(' ')}...\n`)

	const isWindows = process.platform === 'win32'
	const exitCode = await new Promise<number>((resolve) => {
		const child = spawn(pm, args, { stdio: 'inherit', shell: isWindows })
		child.on('error', (err) => {
			ctx.write(`Failed to run ${pm}: ${err.message}\n`)
			resolve(1)
		})
		child.on('close', (code) => resolve(code ?? 1))
	})

	if (exitCode === 0) {
		const cliName = await getCliName()
		ctx.write(`\nLinked! You can now run your CLI with: ${cliName} <command>\n`)
	} else {
		ctx.write(`\nLink failed with exit code ${exitCode}\n`)
	}
}

function getPackageManager(): string {
	const ua = process.env.npm_config_user_agent ?? ''
	if (ua.startsWith('pnpm')) return 'pnpm'
	if (ua.startsWith('yarn')) return 'yarn'
	if (ua.startsWith('bun')) return 'bun'
	return 'npm'
}

async function getCliName(): Promise<string> {
	try {
		const content = await fs.readFile(path.join(process.cwd(), 'package.json'), 'utf-8')
		const pkg = JSON.parse(content)

		// Use the first bin key if available
		if (pkg.bin && typeof pkg.bin === 'object') {
			const firstKey = Object.keys(pkg.bin)[0]
			if (firstKey) return firstKey
		}

		// Fall back to package name without scope
		return pkg.name?.replace(/^@[^/]+\//, '') || 'cli'
	} catch {
		return 'cli'
	}
}
