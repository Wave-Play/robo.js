import { APIEmbed, GuildMember, GuildTextBasedChannel, InteractionReplyOptions, TextBasedChannel } from 'discord.js'
import { GptChatMessage, GptFunctionCall, chat } from './openai.js'
import { Command, Flashcore, client, color } from '@roboplay/robo.js'
import { gptFunctionHandlers, gptFunctions } from '../events/_start.js'
import { randomUUID } from 'crypto'
import { mockInteraction } from '../utils/discord-utils.js'
import { waitForTyping } from '../events/typingStart/debounce.js'
import { logger } from './logger.js'
import { options as pluginOptions } from '../events/_start.js'

export type Hook = (context: HookContext, iteration: number) => Promise<GptChatMessage[]>

type HookEvent = 'chat'

// How long to wait before processing chat to allow users to add more context
const CHAT_DELAY = 1_000

interface HookContext {
	channel?: TextBasedChannel
	member?: GuildMember | null
	messages: GptChatMessage[]
}

const _hooks: Record<HookEvent, Hook[]> = {
	chat: []
}

async function callHooks(event: HookEvent, context: HookContext, iteration: number): Promise<GptChatMessage[]> {
	for (const hook of _hooks[event]) {
		const result = await hook(context, iteration)
		if (result) {
			context.messages = result
		}
	}

	return context.messages
}

function registerHook(event: HookEvent, hook: Hook) {
	_hooks[event].push(hook)
}

function unregisterHook(event: HookEvent, hook: Hook) {
	const index = _hooks[event].indexOf(hook)
	if (index !== -1) {
		_hooks[event].splice(index, 1)
	}
}

interface Mode {
	id: string
	name: string
	systemMessage?: string
}

async function getAllModes(): Promise<Mode[]> {
	const modes = (await Flashcore.get<Mode[]>('ai/modes')) ?? []

	return modes
}

async function upsertMode(mode: Omit<Mode, 'id'>): Promise<Mode> {
	const modes = await getAllModes()
	const index = modes.findIndex((m) => m.name === mode.name)
	let newMode: Mode

	if (index === -1) {
		newMode = {
			...mode,
			id: randomUUID()
		}
		modes.push(newMode)
	} else {
		newMode = {
			...modes[index],
			...mode
		}
		modes[index] = newMode
	}

	await Flashcore.set('ai/modes', modes)
	return newMode
}

export const AiEngine = {
	chat: callGpt,
	Modes: {
		getAll: getAllModes,
		upsert: upsertMode
	},
	off: unregisterHook,
	on: registerHook
}

// Keeps track of users currently being replied to
interface UserReplying {
	originalMessage: string
}
const replying: Record<string, Set<UserReplying>> = {}

export function isReplyingToUser(userId: string): boolean {
	return !!replying[userId]
}

interface CallGptOptions {
	channel?: TextBasedChannel
	member?: GuildMember | null
	model?: string
	onReply?: (message: string) => Promise<void> | void
}
async function callGpt(messages: GptChatMessage[], options: CallGptOptions) {
	const { channel, member, model = 'gpt-4', onReply } = options
	let gptMessages = messages

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
	if (gptMessages[0].role !== 'system' && pluginOptions.systemMessage) {
		gptMessages.unshift({
			role: 'system',
			content: pluginOptions.systemMessage
		})
	}
	let iteration = 0

	// eslint-disable-next-line no-constant-condition
	while (true) {
		gptMessages = await callHooks(
			'chat',
			{
				channel,
				member,
				messages: gptMessages
			},
			iteration++
		)
		logger.debug(`Constructed GPT messages:`, gptMessages)

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
				logger.info(`User typed something new!`, newMessages)
			}

			// If user typed something, add it to the messages and recurse
			if (newMessages.length > 0) {
				newMessages.forEach((message) => {
					gptMessages.push({
						role: 'user',
						content: message
					})
				})
				continue
			}
		}

		// Looks like we're ready to reply! Show as typing
		await channel?.sendTyping()

		const response = await chat({
			model: model,
			messages: gptMessages,
			functions: gptFunctions
		})
		logger.debug(`GPT Response:`, response)

		if (member) {
			// Wait for user to finish typing if they're about to follow up
			newMessages = await waitForTyping(member.user.id)
			if (newMessages.length > 0) {
				logger.info(`User typed something new!`, newMessages)
			}

			// If user typed something, add it to the messages and recurse
			if (newMessages.length > 0) {
				newMessages.forEach((message) => {
					gptMessages.push({
						role: 'user',
						content: message
					})
				})
				continue
			}
		}

		const reply = response?.choices?.[0]
		const replyMessage = reply?.message
		if (!replyMessage) {
			logger.error(`No response from GPT`)
			return
		}

		// Stream reply before executing function call
		if (replyMessage.content) {
			// Clean up username prefix if it's there
			let content = replyMessage.content
			const clientUsername = client.user?.username ?? 'mock'

			if (content.toLowerCase().startsWith(clientUsername.toLowerCase() + ':')) {
				content = content.slice(clientUsername.length + 1).trim()
			}

			await onReply?.(content)
		}

		// Execute a function call if there is one
		if (replyMessage.function_call && reply.finish_reason === 'function_call') {
			const result = await executeFunctionCall(replyMessage.function_call, options?.channel, options?.member)

			// Add the function result to the messages
			gptMessages.push(replyMessage)
			gptMessages.push({
				role: 'function',
				name: replyMessage.function_call.name,
				content: JSON.stringify(result)
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

export async function executeFunctionCall(
	call: GptFunctionCall,
	channel: TextBasedChannel | undefined,
	member: GuildMember | null | undefined
) {
	const gptFunctionHandler = gptFunctionHandlers[call.name]
	const args = JSON.parse((call.arguments as unknown as string) ?? '{}')

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
		const result = await getCommandReply(gptFunctionHandler, channel, member, args)

		return {
			success: true,
			message: result
		}
	} catch (err) {
		logger.debug(color.red(`Error executing AI function:`), err)

		return {
			success: false,
			error: `Error executing function: ${err}`
		}
	}
}

async function getCommandReply(
	command: Command,
	channel: TextBasedChannel | undefined,
	member: GuildMember | null | undefined,
	args: Record<string, string>
) {
	const { interaction, replyPromise } = mockInteraction(channel, member, args)
	let functionResult = await command.default(interaction)

	// If function result is undefined, wait for the reply content
	if (functionResult === undefined) {
		functionResult = await replyPromise
	}

	let result = ''
	logger.wait(`Function result >`, functionResult)
	if (typeof functionResult === 'string') {
		result = functionResult
	} else if (typeof functionResult === 'object') {
		const reply = functionResult as InteractionReplyOptions
		const replyEmbeds = reply.embeds as APIEmbed[]
		result = reply.content || replyEmbeds?.[0]?.title || replyEmbeds?.[0]?.description || ''
	}

	return result
}
