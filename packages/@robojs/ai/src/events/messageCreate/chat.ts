/**
 * Discord message event handler that routes eligible messages into the AI chat pipeline, applying
 * mention and restriction checks, normalizing mentions, loading reply context, and streaming
 * responses back to Discord.
 */
import { AI, getEngine } from '@/core/ai.js'
import { chunkMessage, replaceUsernamesWithIds } from '@/utils/discord-utils.js'
import { logger } from '@/core/logger.js'
import { options as pluginOptions } from '@/events/_start.js'
import { Message } from 'discord.js'
import { client } from 'robo.js'
import type { ChatMessage, ChatMessageContent } from '@/engines/base.js'

/**
 * Processes incoming Discord messages, applying mention and restriction checks before relaying
 * content to the AI chat system with appropriate context.
 */
export default async (message: Message) => {
	// Ignore messages from the bot itself
	if (message.author.id === client.user?.id) {
		return
	}

	// Apply channel restriction filter if configured
	const isRestricted = pluginOptions.restrict?.channelIds?.length
	if (isRestricted && !pluginOptions.restrict?.channelIds?.includes(message.channelId)) {
		logger.debug(`Message received in channel ${message.channelId} but restricted to specific channels`)

		return
	}

	// Require mention unless in whitelisted channel or DM
	const isOpenConvo = pluginOptions.whitelist?.channelIds?.includes(message.channel.id) || message.channel.isDMBased()
	if (!message.mentions.users.has(client.user?.id ?? '') && !isOpenConvo) {
		logger.debug('Message received but not mentioned')

		return
	}

	// Target referenced message if replying to someone else
	let targetMessage = message
	if (message.reference?.messageId) {
		const referencedMessage = await message.channel.messages.fetch(message.reference.messageId)

		if (referencedMessage.author.id !== client.user?.id) {
			targetMessage = referencedMessage

			// Merge user content into target when replying with extra text
			if (message.content.replaceAll(`<@${client.user?.id}>`, '').trim()) {
				targetMessage.content = message.content + '\n' + targetMessage.content
			}
		}
	}

	// Replace Discord mentions with readable usernames
	let processedContent = targetMessage.content.replaceAll(`<@${client.user?.username}>`, '@' + client.user?.username)
	for (const user of targetMessage.mentions.users.values()) {
		processedContent = processedContent.replaceAll(`<@${user.id}>`, '@' + user.username)
	}
	for (const role of targetMessage.mentions.roles.values()) {
		processedContent = processedContent.replaceAll(`<@&${role.id}>`, '@' + role.name)
	}
	for (const channel of targetMessage.mentions.channels.values()) {
		if (!channel.isDMBased()) {
			processedContent = processedContent.replaceAll(`<#${channel.id}>`, '#' + channel.name)
		}
	}

	// Build message array with reply chain context
	const messages = [{ ...targetMessage, content: processedContent } as Message]
	try {
		const replyChain = await getReplyChain(targetMessage, {
			context: isOpenConvo ? 'channel' : 'reference'
		})
		if (replyChain) {
			messages.unshift(...replyChain)
		}
	} catch (error) {
		logger.warn('Error getting reply chain', error)
	}

	// Create username-to-ID mapping for mention replacement
	const userMap: Record<string, string> = {}
	const userIterator = targetMessage.guild ? targetMessage.guild.members.cache.values() : []
	for (const user of userIterator) {
		userMap[user.user.username] = user.user.id
	}

	// Structure messages for AI consumption
	const gptMessages: ChatMessage[] = messages.map((nextMessage) => ({
		role: nextMessage.author.id === client.user?.id ? 'assistant' : 'user',
		content: getMessageContent(nextMessage)
	}))

	// Execute chat with reply chunking and mention restoration
	await AI.chat(gptMessages, {
		channel: message.channel,
		member: message.member ?? message.guild?.members.cache.get(message.author.id),
		user: message.author,
		onReply: async (reply) => {
			let { components, embeds, files } = reply
			// Split response into Discord-compatible chunks
			const chunks = chunkMessage(reply.text ?? '')
			let lastMessage = targetMessage

			// Send metadata-only response when no text content exists
			if (!chunks.length) {
				await lastMessage.reply({
					components,
					embeds,
					files
				})

				return
			}

			// Send each chunk as a reply, attaching extra data to the first message
			for (const chunk of chunks) {
				const content = replaceUsernamesWithIds(chunk, userMap)
				lastMessage = await lastMessage.reply({
					content,
					components,
					embeds,
					files
				})
				components = undefined
				embeds = undefined
				files = undefined
			}
		}
	})
}

// TODO: Handle prefix for answer-other differently! (dedicated processContent function?)
/**
 * Extracts message content for the AI, prefixing with the author's name and including attachments
 * when the engine supports vision.
 */
function getMessageContent(message: Message): ChatMessageContent {
	// Prefix with username for context
	const content = message.author.username + ': ' + message.content

	// Check if engine supports vision for attachments
	const engine = getEngine()
	const features = engine?.supportedFeatures()
	if (message.attachments?.size && features?.vision) {
		logger.debug(`Including ${message.attachments.size} attachments`)

		// Include attachments as image URLs
		return [
			{
				type: 'text',
				text: content
			},
			...message.attachments.map(
				(attachment) =>
					({
						type: 'image_url',
						image_url: attachment.url
					}) as const
			)
		]
	}

	return content
}

/** Options controlling how reply chains are resolved for context. */
interface ReplyChainOptions {
	context?: 'channel' | 'reference'
	depth?: number
}

/**
 * Loads prior messages for context either by fetching channel history or following reply
 * references up to the desired depth.
 */
async function getReplyChain(message: Message, options?: ReplyChainOptions): Promise<Message[]> {
	const { context = 'reference', depth = 3 } = options ?? {}

	// Validate depth parameter
	if (depth <= 0) {
		throw new Error('Message reply chain depth must be greater than 0')
	}

	let chain: Message[] = []
	let currentMessage = message

	// Choose loading strategy based on context mode
	if (context === 'channel') {
		// Load recent messages before the current message
		const messages = await message.channel.messages.fetch({ before: message.id, limit: depth })
		chain = [...messages.values()]
	} else if (context === 'reference') {
		// Follow reply chain up to depth limit
		while (chain.length < depth) {
			const referenceId = currentMessage.reference?.messageId
			if (referenceId) {
				currentMessage = await message.channel.messages.fetch(referenceId)
				chain.push(currentMessage)
			} else {
				break
			}
		}
	}

	// Reverse to chronological order
	return chain.reverse()
}
