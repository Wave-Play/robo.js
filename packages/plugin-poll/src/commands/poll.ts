import { CommandConfig, logger } from '@roboplay/robo.js'
import { CommandInteraction } from 'discord.js'
import { createPoll, polls } from '../core/data.js'

export const config: CommandConfig = {
	description: 'Create a poll',
	options: [
		{
			name: 'question',
			description: 'The question to ask',
			required: true
		},
		{
			name: 'choices',
			description: 'The choices to choose from, separated by commas',
			required: true
		},
		{
			name: 'final',
			description: 'Whether or not users can change their vote. Defaults to false.',
			type: 'boolean'
		}
	]
}

export default async (interaction: CommandInteraction) => {
	const question = interaction.options.get('question')?.value as string
	let choices = (interaction.options.get('choices')?.value as string)?.split(',')
	const final = interaction.options.get('final')?.value as boolean

	// Remove whitespace from choices
	choices = choices?.filter(Boolean)?.map((choice) => choice.trim())
	logger.debug(`Poll: ${question} (${JSON.stringify(choices)})`)

	// Discord only allows up to 5 choices in a single row
	if (choices.length > 5) {
		return {
			content: 'You can only have up to 5 choices!',
			ephemeral: true
		}
	} else if (choices.length < 2) {
		return {
			content: 'You need at least 2 choices!',
			ephemeral: true
		}
	}

	try {
		const pollResponse = await createPoll(interaction, question, choices)
		logger.debug(`Poll response:`, pollResponse)
		polls.set(pollResponse.id, {
			channelId: interaction.channelId,
			question,
			choices,
			final,
			votes: Array(choices.length).fill(0),
			voters: new Map()
		})

		return {
			content: 'Poll created!',
			ephemeral: true
		}
	} catch (error) {
		logger.error(error)
		return {
			content: error instanceof Error ? error.message : 'An unknown error occurred!',
			ephemeral: true
		}
	}
}
