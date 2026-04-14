import type { MiddlewareConfig, MiddlewareData, MiddlewareResult } from '@robojs/discordjs'
import type { ChatInputCommandInteraction } from 'discord.js'
import { Project } from '~/utils/models.js'

export const config: MiddlewareConfig = {
	order: 10
}

export default async (data: MiddlewareData): Promise<MiddlewareResult | void> => {
	if (data.record.type !== 'command' || !data.record.key.startsWith('task/')) return

	const interaction = data.payload[0] as ChatInputCommandInteraction
	const projectName = interaction.options.getString('project')
	if (!projectName) return

	const project = await Project.findFirst({ where: { name: projectName } })
	if (!project) {
		await interaction.reply({ content: `Project "${projectName}" not found.`, ephemeral: true })
		return { abort: true }
	}
}
