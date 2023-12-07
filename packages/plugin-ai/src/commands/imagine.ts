import { CommandConfig, CommandResult, logger } from '@roboplay/robo.js'
import { CommandInteraction } from 'discord.js'
import { AI } from '@/core/ai.js'

export const config: CommandConfig = {
	description: 'Bring your creative visions to life!',
	options: [
		{
			name: 'prompt',
			description: 'Describe your imaginative scene or concept for artistic creation',
			required: true
		}
	]
}

export default async (interaction: CommandInteraction): Promise<CommandResult> => {
	const prompt = interaction.options.get('prompt')?.value as string

	const response = await AI.generateImage({ prompt })
	const images = response?.images?.map((image) => image.url)
	logger.debug(`Generated ${images?.length} images:`, images)

	if (!images?.length) {
		logger.warn('No images were generated.')
		return 'No images were generated.'
	}

	// Fetch image url as buffer then return as file
	const arrayBuffer = await fetch(images[0]).then((res) => res.arrayBuffer())

	return {
		files: [Buffer.from(arrayBuffer)]
	}
}
