export interface File {
	id: string
	bytes?: number
	created_at?: number
	filename?: string
	object?: string
	purpose?: string
}

export interface Message {
	id: string
	object: 'thread.message'
	created_at: number
	thread_id: string
	role: 'assistant' | 'user'
	content: Array<{
		type: 'image_file'
		image_file: unknown
	} | {
		type: 'text',
		text: {
			value: string
			annotations: Array<{
				type: 'file_citation'
				text: string
				start_index: number
				end_index: number
			} | {
				type: 'file_path'
				text: string
				start_index: number
				end_index: number
			}>
		}
	}>
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
		type: 'submit_tool_outputs',
		submit_tool_outputs: {
			tool_calls: Array<{
				id: string
				type: 'function',
				function: {
					name: string,
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
