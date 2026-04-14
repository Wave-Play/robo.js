import { createCommandConfig } from '@robojs/discordjs'
import type { ChatInputCommandInteraction } from 'discord.js'
import { Task, Label } from '~/utils/models.js'
import { formatLabelList } from '~/utils/format.js'

export const config = createCommandConfig({
	description: 'List labels or show labels on a task',
	options: [
		{
			name: 'task-id',
			description: 'Task ID to show labels for (omit to list all labels)',
			type: 'string'
		}
	]
})

export default async (interaction: ChatInputCommandInteraction) => {
	const taskIdPrefix = interaction.options.getString('task-id')

	if (taskIdPrefix) {
		const tasks = await Task.findMany({
			where: { id: { startsWith: taskIdPrefix } },
			take: 1,
			include: { labels: true }
		})
		const task = tasks[0]
		if (!task) {
			return `No task found matching ID \`${taskIdPrefix}\`.`
		}

		const labels = ((task as Record<string, unknown>).labels ?? []) as Array<{ name: string; color: string }>
		return `Labels on **${task.title}**: ${formatLabelList(labels)}`
	}

	const labels = await Label.findMany({ orderBy: { name: 'asc' } })
	if (labels.length === 0) {
		return 'No labels created yet. Use `/label create` to add one.'
	}

	const lines = labels.map((l) => `• **${l.name}** (\`${l.color}\`)`)
	return '**Labels:**\n' + lines.join('\n')
}
