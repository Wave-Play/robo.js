import { logger } from 'robo.js'
import { ID_PREFIX, polls, updatePoll } from '../core/data.js'
import type { ButtonInteraction } from 'discord.js'

export default async (interaction: ButtonInteraction) => {
	// Only handle button interactions related to these polls here
	if (!interaction.isButton() || !interaction.customId?.startsWith(ID_PREFIX)) {
		return
	}

	// Find the poll this button belongs to
	const pollId = interaction.message.id
	const poll = polls.get(pollId)
	logger.debug(`Found poll for "${pollId}": ${JSON.stringify(poll)}`)

	if (!poll) {
		await interaction.reply({
			content: 'This poll no longer exists!',
			ephemeral: true
		})
		return
	}

	// Find the index of the choice that was voted for
	const choiceIndex = parseInt(interaction.customId.split('_')[2])
	const previousVoteIndex = poll.voters.get(interaction.user.id)

	// Validate vote
	if (previousVoteIndex !== undefined && previousVoteIndex !== choiceIndex && poll.final) {
		await interaction.reply({
			content: `You cannot change your vote in this poll. You have already voted for **${poll.choices[previousVoteIndex]}**.`,
			ephemeral: true
		})
		return
	} else if (previousVoteIndex === choiceIndex) {
		await interaction.reply({ content: `You have already selected **${poll.choices[choiceIndex]}**.`, ephemeral: true })
		return
	}

	// Decrement previous vote if changing vote
	if (previousVoteIndex !== undefined && previousVoteIndex !== choiceIndex) {
		poll.votes[previousVoteIndex]--
	}

	// Update poll votes and message
	poll.votes[choiceIndex]++
	poll.voters.set(interaction.user.id, choiceIndex)
	updatePoll(interaction, poll)
	interaction.deferUpdate()
}
