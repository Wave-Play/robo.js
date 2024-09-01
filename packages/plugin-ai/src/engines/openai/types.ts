export interface File {
	id: string
	bytes?: number
	created_at?: number
	filename?: string
	object?: string
	purpose?: string
}

interface MessageContentImageFile {
	type: 'image_file'
	image_file: unknown
}

interface MessageContentTextFileCitation {
	type: 'file_citation'
	text: string
	start_index: number
	end_index: number
}

interface MessageContentTextFilePath {
	type: 'file_path'
	text: string
	start_index: number
	end_index: number
}

interface MessageContentText {
	type: 'text'
	text: {
		value: string
		annotations: Array<MessageContentTextFileCitation | MessageContentTextFilePath>
	}
}

export interface Message {
	id: string
	object: 'thread.message'
	created_at: number
	thread_id: string
	role: 'assistant' | 'user'
	content: Array<MessageContentImageFile | MessageContentText>
	assistant_id: string | null
	run_id: string | null
	file_ids: string[]
	metadata: Record<string, string>
}

export interface Run {
	id: string
	object: 'thread.run'
	created_at: number
	assistant_id: string
	required_action?: {
		type: 'submit_tool_outputs'
		submit_tool_outputs: {
			tool_calls: Array<{
				id: string
				type: 'function'
				function: {
					name: string
					arguments: string
				}
			}>
		}
	}
	thread_id: string
	status: 'queued' | 'in_progress' | 'requires_action' | 'cancelling' | 'cancelled' | 'failed' | 'completed' | 'expired'
}

export interface Thread {
	id: string
	object: 'thread'
	created_at: number
	metadata: Record<string, string>
}
