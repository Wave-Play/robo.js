import type { PrefixCommandConfig, PrefixCommandArgs } from '@robojs/discordjs'
import type { Message } from 'discord.js'
import { Task, Project } from '~/utils/models.js'

export const config: PrefixCommandConfig = {
	description: 'Quick-add a task to the General project',
	sage: { typing: true }
}

export default async function (message: Message, args: PrefixCommandArgs) {
	const title = args.content.trim()
	if (!title) {
		return 'Usage: `!add <task title>`'
	}

	const project = await Project.findFirst({ where: { name: 'General' } })
	if (!project) {
		return 'Default "General" project not found. Start the bot first.'
	}

	const task = await Task.create({
		title,
		projectId: project.id,
		assigneeId: message.author.id
	})

	return `Created task **${task.title}** (ID: \`${task.id.slice(0, 8)}\`).`
}
