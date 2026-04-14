import { createTerminalCommandConfig, Flashcore } from 'robo.js'
import type { TerminalContext } from 'robo.js'
import { Task } from '~/utils/models.js'

export const config = createTerminalCommandConfig({
	description: 'Clear all completed tasks',
	positionalArgs: true,
	options: [
		{
			alias: '-f',
			name: '--force',
			description: 'Skip confirmation',
			type: 'boolean'
		},
		{
			alias: '-a',
			name: '--all',
			description: 'Clear ALL data (full KV wipe)',
			type: 'boolean'
		}
	]
} as const)

export default async function (ctx: TerminalContext<typeof config>) {
	const force = ctx.options.force

	if (ctx.options.all) {
		if (!force) {
			ctx.write('This will wipe ALL Flashcore data. Use --force --all to confirm.')
			return
		}
		await Flashcore.clear()
		ctx.write('All Flashcore data has been cleared.')
		return
	}

	const doneTasks = await Task.count({ where: { status: 'done' } })
	if (doneTasks === 0) {
		ctx.write('No completed tasks to clear.')
		return
	}

	if (!force) {
		ctx.write(`Found ${doneTasks} completed task(s). Use --force to confirm deletion.`)
		return
	}

	const result = await Task.deleteMany({ where: { status: 'done' } })
	ctx.write(`Cleared ${result.count} completed task(s).`)
}
