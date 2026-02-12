/**
 * Button Variations Tests
 *
 * Tests for all button styles, emoji, disabled state, and row limits.
 */
import {
	ActionRow,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonComponent,
	ButtonStyle,
	ChannelType,
	Client,
	GatewayIntentBits,
	MessageActionRowComponent,
	TextChannel
} from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

/** Helper to safely access action row components */
function getActionRowComponents(component: unknown): MessageActionRowComponent[] {
	return (component as ActionRow<MessageActionRowComponent>).components
}

/** Helper to get first button from action row */
function getFirstButton(component: unknown): ButtonComponent {
	return getActionRowComponents(component)[0] as ButtonComponent
}

describe('Button Variations', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let channel: TextChannel

	beforeAll(async () => {
		session = await createSession({
			name: 'button-variations-tests',
			config: {
				guilds: [
					{
						name: 'Button Test Guild',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				]
			}
		})

		client = createClientWithIntents([GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages])
		await client.login(session.token)
		await waitForReady(client)

		const guild = client.guilds.cache.first()!
		channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	it('should send primary button', async () => {
		const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder().setCustomId('primary_btn').setLabel('Primary').setStyle(ButtonStyle.Primary)
		)

		const message = await channel.send({ content: 'Primary', components: [row] })
		expect(getFirstButton(message.components[0]).style).toBe(ButtonStyle.Primary)
	})

	it('should send secondary button', async () => {
		const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder().setCustomId('secondary_btn').setLabel('Secondary').setStyle(ButtonStyle.Secondary)
		)

		const message = await channel.send({ content: 'Secondary', components: [row] })
		expect(getFirstButton(message.components[0]).style).toBe(ButtonStyle.Secondary)
	})

	it('should send success button', async () => {
		const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder().setCustomId('success_btn').setLabel('Success').setStyle(ButtonStyle.Success)
		)

		const message = await channel.send({ content: 'Success', components: [row] })
		expect(getFirstButton(message.components[0]).style).toBe(ButtonStyle.Success)
	})

	it('should send danger button', async () => {
		const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder().setCustomId('danger_btn').setLabel('Danger').setStyle(ButtonStyle.Danger)
		)

		const message = await channel.send({ content: 'Danger', components: [row] })
		expect(getFirstButton(message.components[0]).style).toBe(ButtonStyle.Danger)
	})

	it('should send link button', async () => {
		const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder().setLabel('Visit Site').setStyle(ButtonStyle.Link).setURL('https://discord.com')
		)

		const message = await channel.send({ content: 'Link', components: [row] })
		expect(getFirstButton(message.components[0]).style).toBe(ButtonStyle.Link)
	})

	it('should send button with emoji', async () => {
		const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder().setCustomId('emoji_btn').setLabel('Like').setStyle(ButtonStyle.Primary).setEmoji('👍')
		)

		const message = await channel.send({ content: 'Emoji', components: [row] })
		expect(getFirstButton(message.components[0]).emoji?.name).toBe('👍')
	})

	it('should send button with custom emoji', async () => {
		const guild = client!.guilds.cache.first()!

		// Create a custom emoji for testing
		const emoji = await guild.emojis.create({
			attachment:
				'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
			name: 'btn_emoji'
		})

		try {
			const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder().setCustomId('custom_emoji_btn').setLabel('Custom').setStyle(ButtonStyle.Primary).setEmoji(emoji.id)
			)

			const message = await channel.send({ content: 'Custom Emoji', components: [row] })
			expect(getFirstButton(message.components[0]).emoji?.id).toBe(emoji.id)
		} finally {
			await emoji.delete()
		}
	})

	it('should send disabled button', async () => {
		const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder().setCustomId('disabled_btn').setLabel('Disabled').setStyle(ButtonStyle.Primary).setDisabled(true)
		)

		const message = await channel.send({ content: 'Disabled', components: [row] })
		expect(getFirstButton(message.components[0]).disabled).toBe(true)
	})

	it('should send multiple buttons in row', async () => {
		const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder().setCustomId('btn1').setLabel('1').setStyle(ButtonStyle.Primary),
			new ButtonBuilder().setCustomId('btn2').setLabel('2').setStyle(ButtonStyle.Secondary),
			new ButtonBuilder().setCustomId('btn3').setLabel('3').setStyle(ButtonStyle.Success),
			new ButtonBuilder().setCustomId('btn4').setLabel('4').setStyle(ButtonStyle.Danger),
			new ButtonBuilder().setLabel('5').setStyle(ButtonStyle.Link).setURL('https://example.com')
		)

		const message = await channel.send({ content: 'Multiple', components: [row] })
		expect(getActionRowComponents(message.components[0]).length).toBe(5)
	})

	it('should enforce max 5 buttons per row', async () => {
		const row = new ActionRowBuilder<ButtonBuilder>()

		for (let i = 0; i < 6; i++) {
			row.addComponents(new ButtonBuilder().setCustomId(`btn${i}`).setLabel(`${i}`).setStyle(ButtonStyle.Primary))
		}

		await expect(channel.send({ content: 'Too many', components: [row] })).rejects.toThrow()
	})
})
