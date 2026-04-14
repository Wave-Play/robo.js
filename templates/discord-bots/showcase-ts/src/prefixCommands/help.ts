import type { PrefixCommandConfig } from '@robojs/discordjs'

export const config: PrefixCommandConfig = {
	description: 'Show available prefix commands'
}

export default function () {
	const lines = [
		'**Taskmaster Commands**',
		'`!tasks` / `!t` — List your open tasks',
		'`!add <title>` — Quick-add a task',
		'`!done <id>` — Mark a task as done',
		'`!search <keyword>` — Search tasks by title',
		'`!help` — Show this help message'
	]

	return lines.join('\n')
}
