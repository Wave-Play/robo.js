import { Thread } from './types.js'
import { _PREFIX } from '@/core/constants.js'
import { CreateThreadOptions, openai } from './api.js'
import { ChatFunction, ChatMessage } from '../base.js'
import { Flashcore, color, logger } from 'robo.js'

export interface AssistantData {
	id: string
	object: string
	created_at: number
	name: string
	description: string | null
	model: string
	instructions: string
	tools: Array<{
		function?: ChatFunction
		type: 'code_interpreter' | 'function' | 'retrieval'
	}>
	file_ids: string[]
	metadata: Record<string, string>
}

interface ThreadOptions {
	messages: ChatMessage[]
	threadId: string
	threadMessage: NonNullable<CreateThreadOptions['messages']>[number]
	userId?: string | null
}

interface ThreadResult {
	thread: Thread
	threadCreated: boolean
}

export class Assistant {
	private _data: AssistantData

	constructor(data: AssistantData) {
		this._data = data
	}

	public get data(): AssistantData {
		return this._data
	}

	public async thread(options: ThreadOptions): Promise<ThreadResult> {
		const { threadId, threadMessage } = options

		// First let's load the thread data
		const openaiThreadId = await Flashcore.get<string>(threadId, {
			namespace: _PREFIX + '/thread-index'
		})
		let thread = await Flashcore.get<Thread>(openaiThreadId, {
			namespace: _PREFIX + '/thread'
		})
		const threadExists = !!thread // Do not re-assign this later!
		logger.debug(`Found cached thread for "${color.bold(threadId)}":`, thread)

		// No thread data? Try getting it from OpenAI and cache it
		if (!threadExists && openaiThreadId) {
			thread = await openai.getThread({
				thread_id: openaiThreadId
			})
			logger.debug(`Retrieved fresh thread data:`, thread)
		}

		// Create a new thread if it really doesn't exist
		let isThreadCreated = false
		if (!thread) {
			thread = await openai.createThread({
				messages: [threadMessage],
				metadata: {
					threadId: threadId
				}
			})
			isThreadCreated = true
			logger.debug(`Created new thread:`, thread)
		}

		// Still no thread? That's not good, abort!
		if (!thread) {
			throw new Error(`Failed to create thread for "${threadId}"`)
		}

		// Index the thread and its OpenAI ID equivalent
		if (!threadExists) {
			logger.debug(`Caching thread data for ${threadId}:`, thread)
			await Flashcore.set(thread.id, thread, {
				namespace: _PREFIX + '/thread'
			})
			await Flashcore.set(threadId, thread.id, {
				namespace: _PREFIX + '/thread-index'
			})
		}

		return { thread, threadCreated: isThreadCreated }
	}

	public toJSON(): string {
		return JSON.stringify(this._data, null, 2)
	}

	public toString(): string {
		return this._data.id
	}
}
