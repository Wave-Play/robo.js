import { AI, TokenLimitError } from '@robojs/ai'
import { AttachmentBuilder, CommandInteraction } from 'discord.js'
import { createCommandConfig, type CommandOptions, type CommandResult, logger } from 'robo.js'

/*
  AI Image Generation Command

  This command generates AI images from a text prompt provided by the user.
  It accepts a single "prompt" option. You can customize the description and
  add more options such as size, style, or quality depending on your needs.

  Learn more:
  - Commands guide: https://robojs.dev/discord-bots/commands
  - AI plugin docs: https://robojs.dev/plugins/ai
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

/**
 * Generates images using the AI engine and returns them as Discord attachments.
 *
 * - Auto-defers the reply because image generation can take several seconds.
 * - Catches TokenLimitError to provide user-friendly feedback when limits are exceeded.
 * - Converts provider outputs (base64 or temporary URLs) to AttachmentBuilder instances.
 */
export default async (
	interaction: CommandInteraction,
	options: CommandOptions<typeof config>
): Promise<CommandResult> => {
	const prompt = options.prompt?.trim()
	if (!prompt) {
		return { content: 'Please provide a short description of what I should imagine.', ephemeral: true }
	}

	// Image generation can take time; defer to prevent the interaction from timing out.
	await interaction.deferReply()

	let response
	// Catch TokenLimitError specifically to provide clear guidance if usage limits are exceeded.
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

	// Convert AI-generated outputs into Discord attachments. This helper handles both
	// base64 payloads and temporary URLs depending on the AI provider.
	const attachments = await Promise.all(images.map((image, index) => buildAttachment(image, index)))

	return {
		content: 'Here is what I pictured:',
		files: attachments
	}
}

type GeneratedImage = NonNullable<Awaited<ReturnType<typeof AI.generateImage>>['images']>[number]

async function buildAttachment(image: GeneratedImage, index: number): Promise<AttachmentBuilder> {
	// The AI SDK may return a base64 payload or a temporary URL depending on the provider.
	// Base64 handling: some providers return image data as a base64-encoded string
	// that must be decoded into a Buffer for Discord attachments.
	if ('base64' in image && image.base64) {
		const payload = image.base64.includes(',') ? image.base64.split(',', 2)[1]! : image.base64
		const buffer = Buffer.from(payload, 'base64')
		return new AttachmentBuilder(buffer, { name: `imagine-${index + 1}.png` })
	}
	// URL handling: some providers return temporary URLs that need to be fetched
	// and converted to Buffers before they can be attached in Discord.
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
