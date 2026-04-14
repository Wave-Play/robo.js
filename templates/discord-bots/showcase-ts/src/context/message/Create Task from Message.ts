import type { MessageContextMenuCommandInteraction, Message } from 'discord.js'
import { Task, Project } from '~/utils/models.js'

export default async (interaction: MessageContextMenuCommandInteraction, message: Message) => {
	const title = message.content.slice(0, 100) || 'Untitled task'

	const project = await Project.findFirst({ where: { name: 'General' } })
	if (!project) {
		return 'Default "General" project not found.'
	}

	const task = await Task.create({
		title,
		description: message.content,
		projectId: project.id,
		assigneeId: interaction.user.id
	})

	return `Created task **${task.title}** (ID: \`${task.id.slice(0, 8)}\`) from message.`
}
