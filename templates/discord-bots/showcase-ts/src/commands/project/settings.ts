import { createCommandConfig } from '@robojs/discordjs'
import type { ChatInputCommandInteraction } from 'discord.js'
import { Project, ProjectSettings } from '~/utils/models.js'

export const config = createCommandConfig({
	description: 'View or update project settings',
	options: [
		{
			name: 'project',
			description: 'Project name',
			type: 'string',
			required: true
		},
		{
			name: 'default-priority',
			description: 'Default priority for new tasks',
			type: 'string',
			choices: [
				{ name: 'Low', value: 'low' },
				{ name: 'Medium', value: 'medium' },
				{ name: 'High', value: 'high' }
			]
		},
		{
			name: 'auto-archive-days',
			description: 'Auto-archive done tasks after N days',
			type: 'integer'
		},
		{
			name: 'notify-channel',
			description: 'Channel for task notifications',
			type: 'channel'
		}
	]
})

export default async (interaction: ChatInputCommandInteraction) => {
	const projectName = interaction.options.getString('project', true)
	const defaultPriority = interaction.options.getString('default-priority') as 'low' | 'medium' | 'high' | null
	const autoArchiveDays = interaction.options.getInteger('auto-archive-days')
	const notifyChannel = interaction.options.getChannel('notify-channel')

	const project = await Project.findFirst({ where: { name: projectName }, include: { settings: true } })
	if (!project) {
		return `Project "${projectName}" not found.`
	}

	const isUpdate = defaultPriority || autoArchiveDays !== null || notifyChannel

	if (isUpdate) {
		const updateData: Record<string, unknown> = {}
		if (defaultPriority) updateData.defaultPriority = defaultPriority
		if (autoArchiveDays !== null) updateData.autoArchiveDays = autoArchiveDays
		if (notifyChannel) updateData.notifyChannelId = notifyChannel.id

		// Check if settings exist
		const existing = await ProjectSettings.findFirst({ where: { projectId: project.id } })
		if (existing) {
			await ProjectSettings.update({ where: { id: existing.id }, data: updateData })
		} else {
			await ProjectSettings.create({ projectId: project.id, ...updateData })
		}

		return `Updated settings for **${projectName}**.`
	}

	// View mode
	const settings = (project as Record<string, unknown>).settings as Record<string, unknown> | undefined
	if (!settings) {
		return `**${projectName}** has no custom settings. Use options to configure.`
	}

	const lines = [
		`**Settings for ${projectName}:**`,
		`Default Priority: ${settings.defaultPriority ?? 'medium'}`,
		settings.autoArchiveDays ? `Auto-Archive: ${settings.autoArchiveDays} days` : null,
		settings.notifyChannelId ? `Notify Channel: <#${settings.notifyChannelId}>` : null
	]
	return lines.filter(Boolean).join('\n')
}
