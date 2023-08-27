import { chat } from '../core/openai.js'

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
	const response = await chat({
		messages: [
			{
				role: 'system',
				content: 'Reply with only the choice name in json format. For example: {"choice": "General"}'
			},
			{
				role: 'user',
				content: prompt
			}
		]
	})

	const selected = response?.choices?.[0]?.message?.content
	if (!selected) {
		return null
	}

	return JSON.parse(selected.trim()).choice
}
