import { _engine } from '@/core/ai.js'

interface SelectOneOptions {
	types?: string
}
export async function selectOne(
	selection: string,
	choices: string[],
	options?: SelectOneOptions
): Promise<string | null> {
	const { types = 'choices' } = options ?? {}
	const prompt = `Choose one of the following ${types} that best matches "${selection}": ${choices.join(', ')}`

	const response = await _engine.chat(
		[
			{
				role: 'system',
				content: 'Reply with only the choice name in json format. For example: {"choice": "General"}'
			},
			{
				role: 'user',
				content: prompt
			}
		],
		{
			functions: [],
			model: 'gpt-3.5-turbo',
			threadId: null,
			userId: null
		}
	)
	const reply = response.message?.content as string

	if (!reply) {
		return null
	}

	return JSON.parse(reply.trim()).choice
}
