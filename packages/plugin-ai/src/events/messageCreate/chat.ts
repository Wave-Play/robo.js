import { client } from '@roboplay/robo.js'
import { Message } from 'discord.js'
import { AiEngine, isReplyingToUser } from '../../core/engine.js'
import { GptChatMessage } from '../../core/openai.js'
import { chunkMessage, replaceUsernamesWithIds } from '../../utils/discord-utils.js'
import { addUserFollowUp } from '../typingStart/debounce.js'
import { logger } from '../../core/logger.js'

const CHANNEL_WHITELIST: string[] = []

export default async (message: Message) => {
	// Make sure the bot isn't responding to itself
	if (message.author.id === client.user?.id) {
		return
	}

	// Don't respond unless mentioned unless in whitelisted channel or DM
	const isOpenConvo = CHANNEL_WHITELIST.includes(message.channel.id) || message.channel.isDMBased()
	if (!message.mentions.users.has(client.user?.id ?? '') && !isOpenConvo) {
		if (isReplyingToUser(message.author.id)) {
			addUserFollowUp(message.author.id, message, message.content)
			logger.debug(`Added follow up message for ${message.author.username}`)
		} else {
			logger.debug(`Message received but not mentioned`)
		}

		return
	}
	
	// Target referenced message if replying to someone else
	let targetMessage = message
	if (message.reference?.messageId) {
		const referencedMessage = await message.channel.messages.fetch(message.reference.messageId)

		if (referencedMessage.author.id !== client.user?.id) {
			targetMessage = referencedMessage

			// Make sure to include context if there is any
			if (message.content.replaceAll(`<@${client.user?.id}>`, '').trim()) {
				targetMessage.content = message.content + '\n' + targetMessage.content
			}
		}
	}

	// Replace mentions with usernames
	let processedContent = targetMessage.content.replaceAll(`<@${client.user?.username}>`, '@' + client.user?.username)
	for (const user of targetMessage.mentions.users.values()) {
		processedContent = processedContent.replaceAll(`<@${user.id}>`, '@' + user.username)
	}

	// Replace role mentions with role names
	for (const role of targetMessage.mentions.roles.values()) {
		processedContent = processedContent.replaceAll(`<@&${role.id}>`, '@' + role.name)
	}

	// Replace channel mentions with channel names
	for (const channel of targetMessage.mentions.channels.values()) {
		if (!channel.isDMBased()) {
			processedContent = processedContent.replaceAll(`<#${channel.id}>`, '#' + channel.name)
		}
	}

	// If currently already replying to this user, add as follow up context
	if (isReplyingToUser(targetMessage.author.id)) {
		addUserFollowUp(targetMessage.author.id, targetMessage, processedContent)
		logger.info(`Added follow up message for ${targetMessage.author.username}`)
		return
	}

	// Include reply chain messages for context
	const messages = [{ ...targetMessage, content: processedContent }]
	try {
		const replyChain = await getReplyChain(targetMessage, {
			context: isOpenConvo ? 'channel' : 'reference'
		})
		if (replyChain) {
			messages.unshift(...replyChain)
		}
	} catch (error) {
		logger.warn(`Error getting reply chain`, error)
	}

	// Create map of usernames to user IDs
	const userMap: Record<string, string> = {}
	const userIterator = targetMessage.guild ? targetMessage.guild.members.cache.values() : []
	for (const user of userIterator) {
		userMap[user.user.username] = user.user.id
	} 

	// Structure messages for GPT 
	await AiEngine.chat(
		messages.map(
			(message): GptChatMessage => ({
				role: message.author.id === client.user?.id ? 'assistant' : 'user',
				// TODO: Handle prefix for answer-other differently! (dedicated processContent function?)
				content: message.author.username + ': ' + message.content // Prefix who sent the message (who to refer to)
			})
		),
		{
			channel: message.channel,
			member: message.member ?? message.guild?.members.cache.get(message.author.id),
			onReply: async (reply) => {
				const chunks = chunkMessage(reply)
				let lastMessage = targetMessage

				for (const chunk of chunks) {
					const content = replaceUsernamesWithIds(chunk, userMap)
					lastMessage = await lastMessage.reply(content)
				}
			}
		} 
	)
}

interface ReplyChainOptions {
	context?: 'channel' | 'reference'
	depth?: number
}
async function getReplyChain(message: Message, options?: ReplyChainOptions): Promise<Message[]> {
	const { context = 'reference', depth = 3 } = options ?? {}

	if (depth <= 0) {
		throw new Error(`Message reply chain depth must be greater than 0`)
	}

	let chain: Message[] = []
	let currentMessage = message

	if (context === 'channel') {
		// Load messages before the current message
		const messages = await message.channel.messages.fetch({ before: message.id, limit: depth })
		chain = [...messages.values()]
	} else if (context === 'reference') {
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

	return chain.reverse()
}
