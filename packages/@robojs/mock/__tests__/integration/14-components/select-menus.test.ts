/**
 * Select Menu Variations Tests
 *
 * Tests for String, User, Role, Channel, and Mentionable select menus.
 */
import {
	ActionRow,
	ActionRowBuilder,
	ChannelSelectMenuBuilder,
	ChannelType,
	Client,
	ComponentType,
	GatewayIntentBits,
	MentionableSelectMenuBuilder,
	MessageActionRowComponent,
	RoleSelectMenuBuilder,
	StringSelectMenuBuilder,
	TextChannel,
	UserSelectMenuBuilder
} from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

/** Helper to safely access action row components */
function getActionRowComponents(component: unknown): MessageActionRowComponent[] {
	return (component as ActionRow<MessageActionRowComponent>).components
}

describe('Select Menu Variations', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let channel: TextChannel

	beforeAll(async () => {
		session = await createSession({
			name: 'select-menu-tests',
			config: {
				guilds: [
					{
						name: 'Select Menu Test Guild',
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

	describe('StringSelectMenu', () => {
		it('should send with placeholder', async () => {
			const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
				new StringSelectMenuBuilder()
					.setCustomId('placeholder_select')
					.setPlaceholder('Choose an option')
					.addOptions({ label: 'Option', value: 'opt' })
			)

			const message = await channel.send({ content: 'Placeholder', components: [row] })
			expect((getActionRowComponents(message.components[0])[0] as { placeholder?: string }).placeholder).toBe('Choose an option')
		})

		it('should send with min/max values', async () => {
			const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
				new StringSelectMenuBuilder()
					.setCustomId('minmax_select')
					.setMinValues(2)
					.setMaxValues(4)
					.addOptions(
						{ label: 'Option 1', value: 'opt1' },
						{ label: 'Option 2', value: 'opt2' },
						{ label: 'Option 3', value: 'opt3' },
						{ label: 'Option 4', value: 'opt4' },
						{ label: 'Option 5', value: 'opt5' }
					)
			)

			const message = await channel.send({ content: 'MinMax', components: [row] })
			const component = getActionRowComponents(message.components[0])[0] as { minValues?: number; maxValues?: number }
			expect(component.minValues).toBe(2)
			expect(component.maxValues).toBe(4)
		})

		it('should send with emoji options', async () => {
			const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
				new StringSelectMenuBuilder()
					.setCustomId('emoji_select')
					.addOptions(
						{ label: 'Apple', value: 'apple', emoji: '🍎' },
						{ label: 'Banana', value: 'banana', emoji: '🍌' },
						{ label: 'Cherry', value: 'cherry', emoji: '🍒' }
					)
			)

			const message = await channel.send({ content: 'Emoji', components: [row] })
			const component = getActionRowComponents(message.components[0])[0] as { options?: Array<{ emoji?: { name?: string } }> }
			expect(component.options?.[0]?.emoji?.name).toBe('🍎')
		})

		it('should send with description options', async () => {
			const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
				new StringSelectMenuBuilder()
					.setCustomId('desc_select')
					.addOptions(
						{ label: 'Option A', value: 'a', description: 'This is option A' },
						{ label: 'Option B', value: 'b', description: 'This is option B' }
					)
			)

			const message = await channel.send({ content: 'Descriptions', components: [row] })
			const component = getActionRowComponents(message.components[0])[0] as { options?: Array<{ description?: string }> }
			expect(component.options?.[0]?.description).toBe('This is option A')
		})

		it('should send with default option', async () => {
			const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
				new StringSelectMenuBuilder()
					.setCustomId('default_select')
					.addOptions(
						{ label: 'Not Default', value: 'not_default' },
						{ label: 'Default', value: 'default', default: true }
					)
			)

			const message = await channel.send({ content: 'Default', components: [row] })
			const component = getActionRowComponents(message.components[0])[0] as { options?: Array<{ default?: boolean }> }
			expect(component.options?.[1]?.default).toBe(true)
		})

		it('should enforce max 25 options', () => {
			// Discord.js StringSelectMenuBuilder validates max options at build time
			const select = new StringSelectMenuBuilder().setCustomId('too_many')

			// Adding 25 options should work
			for (let i = 0; i < 25; i++) {
				select.addOptions({ label: `Option ${i}`, value: `opt${i}` })
			}

			// Adding a 26th option should throw
			expect(() => {
				select.addOptions({ label: `Option 25`, value: `opt25` })
			}).toThrow()
		})

		it('should send disabled select', async () => {
			const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
				new StringSelectMenuBuilder()
					.setCustomId('disabled_select')
					.setDisabled(true)
					.addOptions({ label: 'Option', value: 'opt' })
			)

			const message = await channel.send({ content: 'Disabled', components: [row] })
			expect(getActionRowComponents(message.components[0])[0].disabled).toBe(true)
		})
	})

	describe('UserSelectMenu', () => {
		it('should send user select', async () => {
			const row = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
				new UserSelectMenuBuilder()
					.setCustomId('user_select')
					.setPlaceholder('Select users')
					.setMinValues(1)
					.setMaxValues(5)
			)

			const message = await channel.send({ content: 'User Select', components: [row] })
			expect(getActionRowComponents(message.components[0])[0].type).toBe(ComponentType.UserSelect)
		})

		it('should send user select with default users', async () => {
			const row = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
				new UserSelectMenuBuilder().setCustomId('default_user_select').setDefaultUsers([client!.user!.id])
			)

			const message = await channel.send({ content: 'Default User', components: [row] })
			expect(getActionRowComponents(message.components[0])[0].type).toBe(ComponentType.UserSelect)
		})
	})

	describe('RoleSelectMenu', () => {
		it('should send role select', async () => {
			const row = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
				new RoleSelectMenuBuilder().setCustomId('role_select').setPlaceholder('Select roles')
			)

			const message = await channel.send({ content: 'Role Select', components: [row] })
			expect(getActionRowComponents(message.components[0])[0].type).toBe(ComponentType.RoleSelect)
		})

		it('should send role select with default roles', async () => {
			const guild = client!.guilds.cache.first()!
			const role = await guild.roles.create({ name: 'Default Role' })

			try {
				const row = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
					new RoleSelectMenuBuilder().setCustomId('default_role_select').setDefaultRoles([role.id])
				)

				const message = await channel.send({ content: 'Default Role', components: [row] })
				expect(getActionRowComponents(message.components[0])[0].type).toBe(ComponentType.RoleSelect)
			} finally {
				await role.delete()
			}
		})
	})

	describe('ChannelSelectMenu', () => {
		it('should send channel select', async () => {
			const row = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
				new ChannelSelectMenuBuilder().setCustomId('channel_select').setPlaceholder('Select channels')
			)

			const message = await channel.send({ content: 'Channel Select', components: [row] })
			expect(getActionRowComponents(message.components[0])[0].type).toBe(ComponentType.ChannelSelect)
		})

		it('should filter channel types', async () => {
			const row = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
				new ChannelSelectMenuBuilder()
					.setCustomId('filtered_channel')
					.setChannelTypes([ChannelType.GuildText, ChannelType.GuildVoice])
			)

			const message = await channel.send({ content: 'Filtered', components: [row] })
			const component = getActionRowComponents(message.components[0])[0] as { channelTypes?: number[] }
			expect(component.channelTypes).toContain(ChannelType.GuildText)
		})

		it('should send with default channels', async () => {
			const row = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
				new ChannelSelectMenuBuilder().setCustomId('default_channel').setDefaultChannels([channel.id])
			)

			const message = await channel.send({ content: 'Default Channel', components: [row] })
			expect(getActionRowComponents(message.components[0])[0].type).toBe(ComponentType.ChannelSelect)
		})
	})

	describe('MentionableSelectMenu', () => {
		it('should send mentionable select', async () => {
			const row = new ActionRowBuilder<MentionableSelectMenuBuilder>().addComponents(
				new MentionableSelectMenuBuilder().setCustomId('mentionable_select').setPlaceholder('Select users or roles')
			)

			const message = await channel.send({ content: 'Mentionable', components: [row] })
			expect(getActionRowComponents(message.components[0])[0].type).toBe(ComponentType.MentionableSelect)
		})
	})
})
