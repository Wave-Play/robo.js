import { createTerminalCommandConfig } from 'robo.js'
import type { TerminalContext } from 'robo.js'
import { Task } from '~/utils/models.js'

export const config = createTerminalCommandConfig({
	description: 'Show task count by status'
} as const)

export default async function (ctx: TerminalContext<typeof config>) {
	const open = await Task.count({ where: { status: 'open' } })
	const inProgress = await Task.count({ where: { status: 'in_progress' } })
	const done = await Task.count({ where: { status: 'done' } })

	ctx.write(`Open: ${open}\n`)
	ctx.write(`In Progress: ${inProgress}\n`)
	ctx.write(`Done: ${done}\n`)
	ctx.write(`Total: ${open + inProgress + done}\n`)
}
