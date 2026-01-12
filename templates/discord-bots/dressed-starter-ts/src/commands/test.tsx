import { Button, Section, render } from '@dressed/react'
import { getClient } from '@robojs/discordjs'
import { type BaseMessageOptions, ChatInputCommandInteraction, type Message, type SendableChannels } from 'discord.js'
import React, { useState, type ReactNode } from 'react'

export default async (interaction: ChatInputCommandInteraction) => {
	await createMessage(interaction.channelId, <Counter />)
	return 'test'
}

function Counter() {
	const [counter, setCounter] = useState(0)

	return (
		<Section accessory={<Button onClick={() => setCounter(counter + 1)} label="Add" />}>
			Current count: {counter}{'\nTest'}
		</Section>
	)
}

async function createMessage(channelId: string, components: ReactNode | any) {
	const client = getClient()
	const channel = (await client.channels.fetch(channelId)) as SendableChannels
	const data = { flags: ['IsComponentsV2'] } as BaseMessageOptions
	let message: Message | 0 | undefined
	let pendingEdit = false

	function edit() {
		if (!message) return
		return message.edit(data)
	}

	render(components, async (c) => {
		if (c.length === 0) return
		data.components = c
		if (message) return edit()
		if (message === 0) {
			pendingEdit = true
			return
		}
		message = 0
		message = await channel.send(data)
		if (pendingEdit) edit()
	})
}
