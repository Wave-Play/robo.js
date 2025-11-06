import { OpenAiEngine } from '@robojs/ai/engines/openai'
import type { PluginOptions } from '@robojs/ai'

const instructions =
	"You're a helpful assistant named Neko-chan. Keep your responses short and sweet, as if you were casually chatting with a friend. No more than 1 or 2 sentences per reply unless asked for more detail."

export const config: PluginOptions = {
	commands: true,
	engine: new OpenAiEngine({
		chat: {
			model: 'gpt-5',
			reasoningEffort: 'minimal'
		},
		voice: {
			model: 'gpt-realtime'
		}
	}),
	voice: {
		instructions: instructions,
		playbackVoice: 'ash'
	},
	instructions: instructions
} satisfies PluginOptions
export default config
