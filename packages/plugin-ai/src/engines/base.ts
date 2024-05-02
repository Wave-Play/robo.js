import type { GuildMember, TextBasedChannel } from 'discord.js'
import type { Command } from 'robo.js'

export type Hook = (context: HookContext, iteration: number) => Promise<ChatMessage[]>

type HookEvent = 'chat'

interface HookContext {
	channel?: TextBasedChannel | null
	member?: GuildMember | null
	messages: ChatMessage[]
}

export interface ChatMessage {
	content: ChatMessageContent
	function_call?: ChatFunctionCall
	name?: string
	role: 'assistant' | 'function' | 'system' | 'user'
}

interface ChatMessageContentObject {
	image_url?: string
	text?: string
	type: 'image_url' | 'text'
}

export type ChatMessageContent = string | ChatMessageContentObject[]

export interface ChatFunction {
	name: string
	description: string
	parameters: ChatFunctionParameters
}

export interface ChatFunctionParameters {
	properties: Record<string, ChatFunctionProperty>
	required?: string[]
	type?: 'array' | 'object'
}

export interface ChatFunctionCall {
	name: string
	arguments: Record<string, string>
}

export interface ChatFunctionProperty {
	description?: string
	enum?: string[]
	items?: ChatFunctionProperty
	type: 'array' | 'string'
}

export interface ChatOptions {
	functions?: ChatFunction[]
	model?: string
	showTyping?: boolean
	temperature?: number
	threadId?: string | null
	userId?: string | null
}

export interface GenerateImageOptions {
	model?: string
	prompt: string
}

export interface GenerateImageResult {
	images: Array<{
		url: string
	}>
}

export interface ChatResult {
	finish_reason: string
	message?: ChatMessage
}

export abstract class BaseEngine {
	protected _hooks: Record<HookEvent, Hook[]> = {
		chat: []
	}

	public async callHooks(event: HookEvent, context: HookContext, iteration: number): Promise<ChatMessage[]> {
		for (const hook of this._hooks[event]) {
			const result = await hook(context, iteration)
			if (result) {
				context.messages = result
			}
		}

		return context.messages
	}

	public abstract chat(messages: ChatMessage[], options: ChatOptions): Promise<ChatResult>

	public abstract generateImage(options: GenerateImageOptions): Promise<GenerateImageResult>

	public abstract getFunctionHandlers(): Record<string, Command>

	public abstract getInfo(): Record<string, unknown>

	/**
	 * Perform any initialization required by the engine here.
	 */
	public async init(): Promise<void> {
		// Do nothing by default
	}

	public off(event: HookEvent, hook: Hook) {
		const index = this._hooks[event].indexOf(hook)
		if (index !== -1) {
			this._hooks[event].splice(index, 1)
		}
	}

	public on(event: HookEvent, hook: Hook) {
		this._hooks[event].push(hook)
	}
}
