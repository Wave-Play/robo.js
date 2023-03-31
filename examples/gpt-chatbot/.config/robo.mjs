// @ts-check

/**
 * @type {import('@roboplay/discord').Config}
 **/
export default {
	intents: ['Guilds'],
	plugins: [
		[
			'robo-gpt-plugin',
			{
				openaiKey: process.env.OPENAI_KEY
			}
		]
	]
}
