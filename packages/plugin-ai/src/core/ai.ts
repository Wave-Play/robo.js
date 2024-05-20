import { logger } from '@/core/logger.js'
import { options as pluginOptions } from '@/events/_start.js'
import { waitForTyping } from '@/events/typingStart/debounce.js'
import { mockInteraction } from '@/utils/discord-utils.js'
import { Command, client, color } from 'robo.js'
import { extractCommandOptions } from 'robo.js/utils.js'
import type {
	BaseEngine,
	ChatFunctionCall,
	ChatMessage,
	ChatMessageContent,
	ChatOptions as BaseChatOptions,
	GenerateImageOptions,
	GenerateImageResult
} from '@/engines/base.js'
import type {
	APIEmbed,
	GuildMember,
	GuildTextBasedChannel,
	InteractionReplyOptions,
	TextBasedChannel
} from 'discord.js'

/**
 * The core AI interface.
 * Use this to call AI features programatically.
 */
export const AI = {
	chat,
	chatSync,
	generateImage,
	isReady: () => _initialized
}

// Keeps track of users currently being replied to
interface UserReplying {
	originalMessage: ChatMessageContent
}
const replying: Record<string, Set<UserReplying>> = {}

// How long to wait before processing chat to allow users to add more context
const CHAT_DELAY = 1_000

export function isReplyingToUser(userId: string): boolean {
	return !!replying[userId]
}

export let _engine: BaseEngine
let _initialized = false

export function setEngine(engine: BaseEngine) {
	_engine = engine
}

export function setEngineReady() {
	_initialized = true
}

export interface ChatReply {
	components?: InteractionReplyOptions['components']
	embeds?: InteractionReplyOptions['embeds']
	files?: InteractionReplyOptions['files']
	text?: string
}

interface ChatOptions extends Omit<BaseChatOptions, 'threadId' | 'userId'> {
	channel?: TextBasedChannel | null
	member?: GuildMember | null
	onReply: (reply: ChatReply) => void | Promise<void>
}

async function chat(messages: ChatMessage[], options: ChatOptions): Promise<void> {
	const { channel, member, onReply, showTyping = true } = options
	let aiMessages = messages

	// Add to replying registry
	if (member) {
		let replyingSet = replying[member.user.id]
		if (!replyingSet) {
			replyingSet = new Set()
			replying[member.user.id] = replyingSet
		}
		replyingSet.add({
			originalMessage: messages[messages.length - 1].content
		})
	}

	// Insert system message if it's not already there
	if (aiMessages[0].role !== 'system' && pluginOptions.systemMessage) {
		aiMessages.unshift({
			role: 'system',
			content: pluginOptions.systemMessage
		})
	}

	let iteration = 0

	while (true) {
		aiMessages = await _engine.callHooks(
			'chat',
			{
				channel,
				member,
				messages: aiMessages
			},
			iteration++
		)
		logger.debug(`Constructed GPT messages:`, aiMessages)

		// Delay for 1 second to let users potentially follow up
		const time = Date.now()
		logger.debug(`Waiting for ${CHAT_DELAY}ms...`)
		await new Promise((resolve) => setTimeout(resolve, CHAT_DELAY))
		logger.debug(`Done waiting after`, Date.now() - time + 'ms')
		let newMessages: string[] = []

		if (member) {
			// Wait for user to finish typing if they're about to follow up
			newMessages = await waitForTyping(member.user.id)
			if (newMessages.length > 0) {
				logger.debug(`User typed something new!`, newMessages)
			}

			// If user typed something, add it to the messages and recurse
			if (newMessages.length > 0) {
				newMessages.forEach((message) => {
					aiMessages.push({
						role: 'user',
						content: message
					})
				})
				continue
			}
		}

		// Looks like we're ready to reply! Show as typing
		if (showTyping) {
			await channel?.sendTyping()
		}

		const reply = await _engine.chat(aiMessages, {
			...options,
			threadId: channel?.id as string,
			userId: member?.user.id as string
		})

		if (member) {
			// Wait for user to finish typing if they're about to follow up
			newMessages = await waitForTyping(member.user.id)
			if (newMessages.length > 0) {
				logger.debug(`User typed something new!`, newMessages)
			}

			// If user typed something, add it to the messages and recurse
			if (newMessages.length > 0) {
				newMessages.forEach((message) => {
					aiMessages.push({
						role: 'user',
						content: message
					})
				})
				continue
			}
		}

		if (!reply) {
			logger.error(`No response from engine`)
			return
		}

		// Stream reply before executing function call
		if (typeof reply.message?.content === 'string') {
			// Clean up username prefix if it's there
			let content = reply.message.content
			const clientUsername = client?.user?.username ?? 'mock'

			if (content.toLowerCase().startsWith(clientUsername.toLowerCase() + ':')) {
				content = content.slice(clientUsername.length + 1).trim()
			}

			await onReply?.({
				text: content
			})
		}

		// Execute a function call if there is one
		if (reply.message?.function_call && reply.finish_reason === 'function_call') {
			const result = await executeFunctionCall(reply.message.function_call, options?.channel, options?.member)
			logger.debug(`Function call result:`, result)

			// If this includes special data such as files or embeds, send them ahead of time
			if (result.reply?.components?.length || result.reply?.files?.length || result.reply?.embeds?.length) {
				logger.debug(`Sending special data ahead of time...`)
				await onReply?.({
					components: result.reply.components,
					embeds: result.reply.embeds,
					files: result.reply.files
				})
			}

			// Add the function result to the messages
			aiMessages.push(reply.message)
			aiMessages.push({
				role: 'function',
				name: reply.message.function_call.name,
				content: JSON.stringify({
					error: result.error,
					message: result.reply?.message,
					success: result.success
				})
			})
			continue
		}

		break
	}

	// Remove from replying registry
	if (member) {
		delete replying[member.user.id]
	}
}

async function chatSync(messages: ChatMessage[], options: Omit<ChatOptions, 'onReply'>): Promise<ChatReply> {
	return new Promise((resolve) => {
		chat(messages, {
			...options,
			onReply: (reply) => {
				resolve(reply)
			}
		})
	})
}

async function generateImage(options: GenerateImageOptions): Promise<GenerateImageResult> {
	return _engine.generateImage(options)
}

async function executeFunctionCall(
	call: ChatFunctionCall,
	channel: TextBasedChannel | null | undefined,
	member: GuildMember | null | undefined
) {
	const gptFunctionHandler = _engine.getFunctionHandlers()[call.name]
	logger.debug(`Executing function call:`, call.name, call.arguments)

	// Validate that the function exists
	if (!gptFunctionHandler) {
		return {
			success: false,
			error: `Don't know how to ${call.name}`
		}
	}

	// Make sure that the function is allowed to be executed in DMs
	if (!gptFunctionHandler.config?.dmPermission && channel?.isDMBased()) {
		return {
			success: false,
			error: `I can't ${call.name} in DMs`
		}
	}

	// Make sure that the user has permission to execute the function
	if (gptFunctionHandler.config?.defaultMemberPermissions) {
		if (!member) {
			return {
				success: false,
				error: `I could not find your member information`
			}
		}

		let defaultMemberPermissions = gptFunctionHandler.config.defaultMemberPermissions
		if (typeof defaultMemberPermissions !== 'string') {
			defaultMemberPermissions = defaultMemberPermissions + ''
		}
		defaultMemberPermissions = defaultMemberPermissions.replace('n', '')
		const commandPermissions = BigInt(gptFunctionHandler.config.defaultMemberPermissions)
		const memberPermissions = member.permissionsIn(channel as GuildTextBasedChannel)

		if ((memberPermissions.bitfield & commandPermissions) !== commandPermissions) {
			return {
				success: false,
				error: `Member does not have permission to do that`
			}
		}
	}

	// Execute the function
	try {
		const reply = await getCommandReply(gptFunctionHandler, channel, member, call.arguments)
		logger.debug(`Command function reply:`, reply)

		return {
			success: true,
			reply: reply
		}
	} catch (err) {
		logger.debug(color.red(`Error executing AI function:`), err)

		return {
			success: false,
			error: `Error executing function: ${err}`
		}
	}
}

interface CommandReply extends ChatReply {
	message: string
}
async function getCommandReply(
	command: Command,
	channel: TextBasedChannel | null | undefined,
	member: GuildMember | null | undefined,
	args: Record<string, string>
): Promise<CommandReply> {
	logger.debug(`Executing command:`, command.config, args)
	const { interaction, replyPromise } = mockInteraction(channel, member, args)
	const commandOptions = extractCommandOptions(interaction, command.config?.options)
	let functionResult = await command.default(interaction, commandOptions)

	// If function result is undefined, wait for the reply content
	if (functionResult === undefined) {
		functionResult = await replyPromise
	}

	const result: CommandReply = {
		components: [],
		embeds: [],
		files: [],
		message: '',
		text: ''
	}
	if (typeof functionResult === 'string') {
		result.message = functionResult
		result.text = functionResult
	} else if (typeof functionResult === 'object') {
		const reply = functionResult as InteractionReplyOptions
		const replyEmbeds = reply.embeds as APIEmbed[]

		result.components = reply.components
		result.embeds = replyEmbeds
		result.files = reply.files
		result.text = reply.content
		result.message = reply.content || replyEmbeds?.[0]?.title || replyEmbeds?.[0]?.description || ''
	}

	// Describe result if there's no message but there is something
	if (!result.message && result.files?.length) {
		result.message = `The file processing task is complete. (do not include file references in reply)`
	}

	return result
}
