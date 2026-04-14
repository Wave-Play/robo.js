/**
 * /db backup - Create a cold-copy style backup of the persistent Flashcore store.
 */
import { cp, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { color, createTerminalCommandConfig } from 'robo.js'
import type { TerminalContext } from 'robo.js'

export const config = createTerminalCommandConfig({
	description: 'Create a backup of .robo/flashcore',
	options: [
		{ alias: '-o', name: '--output', description: 'Destination directory (defaults to .robo/flashcore-backups/<timestamp>)', type: 'string' }
	]
} as const)

const Indent = '   '

export default async function (ctx: TerminalContext<typeof config>) {
	const sourceDir = path.join(process.cwd(), '.robo', 'flashcore')
	const outputDir = ctx.options.output
		? path.resolve(process.cwd(), ctx.options.output)
		: path.join(
			process.cwd(),
			'.robo',
			'flashcore-backups',
			new Date().toISOString().replace(/[:.]/g, '-')
		)

	try {
		await mkdir(path.dirname(outputDir), { recursive: true })
		await cp(sourceDir, outputDir, { recursive: true, errorOnExist: true })

		ctx.write('\n')
		ctx.write(Indent + color.green('Backup created.') + '\n')
		ctx.write(Indent + `Source: ${color.cyan(sourceDir)}\n`)
		ctx.write(Indent + `Output: ${color.cyan(outputDir)}\n`)
		ctx.write('\n')
		ctx.write(Indent + color.dim('Recommended procedure: stop Robo, back up .robo/flashcore, then restart.') + '\n')
		ctx.write('\n')
	} catch (error) {
		ctx.write('\n')
		ctx.write(Indent + color.red(`Backup failed: ${error}`) + '\n')
		ctx.write('\n')
	}
}
