import { createCommandConfig } from '@robojs/discordjs'
import type { ChatInputCommandInteraction } from 'discord.js'
import { Task } from '~/utils/models.js'
import { generateId, isValidId, extractTimestamp, UniqueConstraintError } from 'robo.js/flashcore'

export const config = createCommandConfig({
	description: 'Inspect a task ID and Flashcore utilities',
	options: [
		{
			name: 'id',
			description: 'Task ID to inspect (or "demo" for utility demo)',
			type: 'string',
			required: true
		}
	]
})

export default async (interaction: ChatInputCommandInteraction) => {
	const input = interaction.options.getString('id', true)

	if (input === 'demo') {
		const newId = generateId()
		const valid = isValidId(newId)
		const rawTs = extractTimestamp(newId)
		const timestamp = rawTs !== null ? new Date(rawTs) : null
		const lines = [
			'**Flashcore ID Utilities Demo**',
			`Generated ID: \`${newId}\``,
			`Valid: ${valid}`,
			`Timestamp: ${timestamp ? timestamp.toISOString() : 'N/A'}`,
			'',
			'**UniqueConstraintError Demo:**'
		]

		// Demonstrate UniqueConstraintError by trying to create a duplicate
		try {
			const tasks = await Task.findMany({ take: 1 })
			if (tasks.length > 0) {
				const existing = tasks[0]
				await Task.create({ title: existing.title, projectId: existing.projectId })
				lines.push('No error (unexpected)')
			} else {
				lines.push('No tasks to test with')
			}
		} catch (err) {
			if (err instanceof UniqueConstraintError) {
				lines.push(`Caught UniqueConstraintError: ${err.message}`)
			} else {
				lines.push(`Caught different error: ${(err as Error).message}`)
			}
		}

		return lines.join('\n')
	}

	// Inspect a real task ID
	const valid = isValidId(input)
	if (!valid) {
		return `\`${input}\` is not a valid Flashcore ID.`
	}

	const rawTs = extractTimestamp(input)
	const timestamp = rawTs !== null ? new Date(rawTs) : null
	const tasks = await Task.findMany({ where: { id: { startsWith: input } }, take: 1, include: { project: true } })
	const task = tasks[0]

	if (!task) {
		return `No task found for ID \`${input}\`.\nTimestamp: ${timestamp ? timestamp.toISOString() : 'N/A'}`
	}

	const project = (task as Record<string, unknown>).project as { name: string } | undefined
	const lines = [
		`**Task: ${task.title}**`,
		`Full ID: \`${task.id}\``,
		`Valid: ${valid}`,
		`Created (from ID): ${timestamp ? timestamp.toISOString() : 'N/A'}`,
		`Status: ${task.status}`,
		`Priority: ${task.priority}`,
		`Project: ${project?.name ?? 'Unknown'}`,
		task.archived ? '📦 **Archived**' : null,
		task.estimatedHours ? `⏱ ${task.estimatedHours}h estimated` : null,
		task.metadata ? `Metadata: \`${JSON.stringify(task.metadata)}\`` : null
	]

	return lines.filter(Boolean).join('\n')
}
