import { Analytics } from '@robojs/analytics'
import { createCommandConfig } from 'robo.js'
import type { ChatInputCommandInteraction } from 'discord.js'

export const config = createCommandConfig({
	description: 'Test analytics integration. Delete this command after testing.'
} as const)

export default (interaction: ChatInputCommandInteraction) => {
	// An event can be anything you want to track.
	Analytics.event('testing_event')

	// A view is a page view or screen view. (not really for discord bots)
	Analytics.view('Test Page')

	// Use a unique identifier per session if you can.
	// This may be more difficult for discord bots, but you can use the user id, guild id, etc.
	const sessionId = interaction.channelId ?? interaction.guildId
	Analytics.event('something_happened', { sessionId })

	// Also include a user id as well whenever possible for greater accuracy.
	Analytics.event('test_event', {
		sessionId: sessionId,
		userId: interaction.user.id
	})

	return {
		content: 'Check your analytics dashboard to see if the events were tracked.',
		ephemeral: true
	}
}
