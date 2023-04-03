// @ts-check

/**
 * @type {import('@roboplay/discord').Config}
 **/
export default {
	intents: ['Guilds'],
	plugins: [
		[
			'@roboplay/plugin-gpt',
			{
				openaiKey: process.env.OPENAI_KEY
			}
		]
	]
}
