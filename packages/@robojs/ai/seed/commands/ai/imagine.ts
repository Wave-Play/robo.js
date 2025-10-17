import { AI, TokenLimitError } from '@robojs/ai'
import { AttachmentBuilder, CommandInteraction } from 'discord.js'
import { createCommandConfig, type CommandOptions, type CommandResult, logger } from 'robo.js'

/**
 * Generates AI images from a short text prompt and returns them as Discord attachments.
 */
export const config = createCommandConfig({
	description: 'Bring your creative visions to life!',
	options: [
		{
			name: 'prompt',
			description: 'Describe your imaginative scene or concept for artistic creation',
			required: true,
			type: 'string'
		}
	]
} as const)

export default async (
	interaction: CommandInteraction,
	options: CommandOptions<typeof config>
): Promise<CommandResult> => {
	const prompt = options.prompt?.trim()
	if (!prompt) {
		return { content: 'Please provide a short description of what I should imagine.', ephemeral: true }
	}

	await interaction.deferReply()

	let response
	try {
		response = await AI.generateImage({ prompt })
	} catch (error) {
		if (error instanceof TokenLimitError) {
			return {
				content: error.displayMessage,
				ephemeral: true
			}
		}
		throw error
	}
	const images = response?.images ?? []
	logger.debug(`Imagined ${images.length} images`) // File buffers can be large; avoid logging contents.

	if (!images.length) {
		logger.warn('No images were generated.')
		return 'No images were generated.'
	}

	const attachments = await Promise.all(images.map((image, index) => buildAttachment(image, index)))

	return {
		content: 'Here is what I pictured:',
		files: attachments
	}
}

type GeneratedImage = NonNullable<Awaited<ReturnType<typeof AI.generateImage>>['images']>[number]

async function buildAttachment(image: GeneratedImage, index: number): Promise<AttachmentBuilder> {
	// The AI SDK may return a base64 payload or a temporary URL depending on the provider.
	if ('base64' in image && image.base64) {
		const payload = image.base64.includes(',') ? image.base64.split(',', 2)[1]! : image.base64
		const buffer = Buffer.from(payload, 'base64')
		return new AttachmentBuilder(buffer, { name: `imagine-${index + 1}.png` })
	}

	if ('url' in image && image.url) {
		const result = await fetch(image.url)
		if (!result.ok) {
			throw new Error(`Failed to download image at index ${index}: ${result.status} ${result.statusText}`)
		}
		const buffer = Buffer.from(await result.arrayBuffer())
		return new AttachmentBuilder(buffer, { name: `imagine-${index + 1}.png` })
	}

	throw new Error(`Unsupported image payload at index ${index}`)
}
