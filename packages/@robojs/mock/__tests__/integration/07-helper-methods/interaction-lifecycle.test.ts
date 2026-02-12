/**
 * Interaction Response Lifecycle Tests
 *
 * Comprehensive tests for interaction response methods including reply, defer,
 * edit, delete, followUp, and modals across all interaction types.
 */
import {
	ActionRowBuilder,
	ApplicationCommandType,
	ButtonBuilder,
	ButtonInteraction,
	ButtonStyle,
	ChannelSelectMenuInteraction,
	ChannelType,
	ChatInputCommandInteraction,
	Client,
	ComponentType,
	EmbedBuilder,
	Events,
	GatewayIntentBits,
	Interaction,
	InteractionType,
	MentionableSelectMenuInteraction,
	ModalBuilder,
	ModalSubmitInteraction,
	RoleSelectMenuInteraction,
	StringSelectMenuInteraction,
	TextChannel,
	TextInputBuilder,
	TextInputStyle,
	UserSelectMenuInteraction
} from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { generateSnowflake, waitForReady } from '../utils/helpers.js'

/**
 * Wait for an interaction event with a filter predicate
 */
function waitForInteraction(
	client: Client,
	predicate: (interaction: Interaction) => boolean,
	timeout = 5000
): Promise<Interaction> {
	return new Promise((resolve, reject) => {
		const timeoutId = setTimeout(() => {
			client.off(Events.InteractionCreate, handler)
			reject(new Error(`Timeout waiting for interaction after ${timeout}ms`))
		}, timeout)

		const handler = (interaction: Interaction) => {
			if (predicate(interaction)) {
				clearTimeout(timeoutId)
				client.off(Events.InteractionCreate, handler)
				resolve(interaction)
			}
		}

		client.on(Events.InteractionCreate, handler)
	})
}

describe('Interaction Response Lifecycle', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let channel: TextChannel
	let guildId: string

	beforeAll(async () => {
		session = await createSession({
			name: 'interaction-lifecycle-tests',
			config: {
				guilds: [
					{
						name: 'Interaction Lifecycle Guild',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				]
			}
		})

		client = createClientWithIntents([GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages])
		await client.login(session.token)
		await waitForReady(client)

		const guild = client.guilds.cache.first()!
		guildId = guild.id
		channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	/**
	 * Helper to dispatch a slash command interaction
	 */
	async function dispatchCommandInteraction(commandName = 'test'): Promise<ChatInputCommandInteraction> {
		const interactionId = generateSnowflake()
		const token = `test-token-${Date.now()}`

		const eventPromise = waitForInteraction(
			client!,
			(i) => i.isChatInputCommand() && i.id === interactionId
		)

		await dispatchEvent(session.id, 'INTERACTION_CREATE', {
			id: interactionId,
			application_id: client!.user!.id,
			type: InteractionType.ApplicationCommand,
			guild_id: guildId,
			channel_id: channel.id,
			channel: {
				id: channel.id,
				type: ChannelType.GuildText,
				name: channel.name,
				guild_id: guildId
			},
			member: {
				user: { id: generateSnowflake(), username: 'TestUser', discriminator: '0000', avatar: null },
				roles: [],
				joined_at: new Date().toISOString(),
				deaf: false,
				mute: false
			},
			user: { id: generateSnowflake(), username: 'TestUser', discriminator: '0000', avatar: null },
			data: {
				id: generateSnowflake(),
				name: commandName,
				type: ApplicationCommandType.ChatInput
			},
			token,
			version: 1
		})

		return (await eventPromise) as ChatInputCommandInteraction
	}

	/**
	 * Helper to dispatch a button interaction
	 */
	async function dispatchButtonInteraction(customId = 'test_button', messageId?: string): Promise<ButtonInteraction> {
		const interactionId = generateSnowflake()
		const token = `btn-token-${Date.now()}`
		const msgId = messageId ?? generateSnowflake()

		const eventPromise = waitForInteraction(client!, (i) => i.isButton() && i.id === interactionId)

		await dispatchEvent(session.id, 'INTERACTION_CREATE', {
			id: interactionId,
			application_id: client!.user!.id,
			type: InteractionType.MessageComponent,
			guild_id: guildId,
			channel_id: channel.id,
			channel: {
				id: channel.id,
				type: ChannelType.GuildText,
				name: channel.name,
				guild_id: guildId
			},
			member: {
				user: { id: generateSnowflake(), username: 'TestUser', discriminator: '0000', avatar: null },
				roles: [],
				joined_at: new Date().toISOString(),
				deaf: false,
				mute: false
			},
			user: { id: generateSnowflake(), username: 'TestUser', discriminator: '0000', avatar: null },
			data: {
				custom_id: customId,
				component_type: ComponentType.Button
			},
			message: {
				id: msgId,
				channel_id: channel.id,
				content: 'Button message',
				author: { id: client!.user!.id, username: 'Bot', discriminator: '0000', avatar: null },
				timestamp: new Date().toISOString(),
				edited_timestamp: null,
				tts: false,
				mention_everyone: false,
				mentions: [],
				mention_roles: [],
				attachments: [],
				embeds: [],
				pinned: false,
				type: 0
			},
			token,
			version: 1
		})

		return (await eventPromise) as ButtonInteraction
	}

	describe('ChatInputCommandInteraction', () => {
		it('should reply to interaction', async () => {
			const interaction = await dispatchCommandInteraction()

			await interaction.reply({ content: 'Hello!' })

			expect(interaction.replied).toBe(true)
			expect(interaction.deferred).toBe(false)
		})

		it('should reply with ephemeral message', async () => {
			const interaction = await dispatchCommandInteraction()

			await interaction.reply({ content: 'Secret', ephemeral: true })

			expect(interaction.replied).toBe(true)
		})

		it('should defer reply', async () => {
			const interaction = await dispatchCommandInteraction()

			await interaction.deferReply()

			expect(interaction.deferred).toBe(true)
			expect(interaction.replied).toBe(false)
		})

		it('should defer reply with ephemeral', async () => {
			const interaction = await dispatchCommandInteraction()

			await interaction.deferReply({ ephemeral: true })

			expect(interaction.deferred).toBe(true)
		})

		it('should edit reply after defer', async () => {
			const interaction = await dispatchCommandInteraction()

			await interaction.deferReply()
			await interaction.editReply({ content: 'Edited after defer' })

			const message = await interaction.fetchReply()
			expect(message.content).toBe('Edited after defer')
		})

		it('should edit reply after reply', async () => {
			const interaction = await dispatchCommandInteraction()

			await interaction.reply({ content: 'Original' })
			await interaction.editReply({ content: 'Edited' })

			const message = await interaction.fetchReply()
			expect(message.content).toBe('Edited')
		})

		it('should delete reply', async () => {
			const interaction = await dispatchCommandInteraction()

			await interaction.reply({ content: 'Delete me' })
			await interaction.deleteReply()

			await expect(interaction.fetchReply()).rejects.toBeDefined()
		})

		it('should send followup', async () => {
			const interaction = await dispatchCommandInteraction()

			await interaction.reply({ content: 'First' })
			const followup = await interaction.followUp({ content: 'Second' })

			expect(followup.content).toBe('Second')
		})

		it('should send multiple followups', async () => {
			const interaction = await dispatchCommandInteraction()

			await interaction.reply({ content: 'Original' })
			const followup1 = await interaction.followUp({ content: 'Followup 1' })
			const followup2 = await interaction.followUp({ content: 'Followup 2' })

			expect(followup1.id).not.toBe(followup2.id)
		})

		it('should fetch reply', async () => {
			const interaction = await dispatchCommandInteraction()

			await interaction.reply({ content: 'Fetch me' })

			const message = await interaction.fetchReply()
			expect(message.content).toBe('Fetch me')
		})

		it('should fail to reply twice', async () => {
			const interaction = await dispatchCommandInteraction()

			await interaction.reply({ content: 'First' })

			await expect(interaction.reply({ content: 'Second' })).rejects.toBeDefined()
		})

		it('should reply with embeds', async () => {
			const interaction = await dispatchCommandInteraction()

			const embed = new EmbedBuilder().setTitle('Interaction Embed')
			await interaction.reply({ embeds: [embed] })

			const message = await interaction.fetchReply()
			expect(message.embeds[0].title).toBe('Interaction Embed')
		})

		it('should reply with components', async () => {
			const interaction = await dispatchCommandInteraction()

			const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder().setCustomId('btn').setLabel('Click').setStyle(ButtonStyle.Primary)
			)

			await interaction.reply({ content: 'Click:', components: [row] })

			const message = await interaction.fetchReply()
			expect(message.components.length).toBe(1)
		})
	})

	describe('ButtonInteraction', () => {
		it('should update button message', async () => {
			const interaction = await dispatchButtonInteraction()

			await interaction.update({ content: 'Button clicked!' })

			expect(interaction.replied).toBe(true)
		})

		it('should defer update', async () => {
			const interaction = await dispatchButtonInteraction()

			await interaction.deferUpdate()

			expect(interaction.deferred).toBe(true)
		})

		it('should reply instead of update', async () => {
			const interaction = await dispatchButtonInteraction()

			await interaction.reply({ content: 'New message', ephemeral: true })

			expect(interaction.replied).toBe(true)
		})

		it('should update with new components', async () => {
			const interaction = await dispatchButtonInteraction()

			const newRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder()
					.setCustomId('new_btn')
					.setLabel('New Button')
					.setStyle(ButtonStyle.Secondary)
					.setDisabled(true)
			)

			await interaction.update({ components: [newRow] })

			expect(interaction.replied).toBe(true)
		})
	})

	describe('SelectMenuInteraction', () => {
		/**
		 * Helper to dispatch a string select menu interaction
		 */
		async function dispatchStringSelectInteraction(
			customId: string,
			values: string[]
		): Promise<StringSelectMenuInteraction> {
			const interactionId = generateSnowflake()
			const token = `select-token-${Date.now()}`

			const eventPromise = waitForInteraction(
				client!,
				(i) => i.isStringSelectMenu() && i.id === interactionId
			)

			await dispatchEvent(session.id, 'INTERACTION_CREATE', {
				id: interactionId,
				application_id: client!.user!.id,
				type: InteractionType.MessageComponent,
				guild_id: guildId,
				channel_id: channel.id,
				channel: {
					id: channel.id,
					type: ChannelType.GuildText,
					name: channel.name,
					guild_id: guildId
				},
				member: {
					user: { id: generateSnowflake(), username: 'TestUser', discriminator: '0000', avatar: null },
					roles: [],
					joined_at: new Date().toISOString(),
					deaf: false,
					mute: false
				},
				user: { id: generateSnowflake(), username: 'TestUser', discriminator: '0000', avatar: null },
				data: {
					custom_id: customId,
					component_type: ComponentType.StringSelect,
					values
				},
				message: {
					id: generateSnowflake(),
					channel_id: channel.id,
					content: 'Select message',
					author: { id: client!.user!.id, username: 'Bot', discriminator: '0000', avatar: null },
					timestamp: new Date().toISOString(),
					edited_timestamp: null,
					tts: false,
					mention_everyone: false,
					mentions: [],
					mention_roles: [],
					attachments: [],
					embeds: [],
					pinned: false,
					type: 0
				},
				token,
				version: 1
			})

			return (await eventPromise) as StringSelectMenuInteraction
		}

		describe('StringSelectMenuInteraction', () => {
			it('should get selected values', async () => {
				const interaction = await dispatchStringSelectInteraction('string_select', ['option1', 'option2'])
				expect(interaction.values).toEqual(['option1', 'option2'])
			})

			it('should update with selection result', async () => {
				const interaction = await dispatchStringSelectInteraction('string_select_update', ['selected'])

				await interaction.update({
					content: `You selected: ${interaction.values.join(', ')}`
				})

				expect(interaction.replied).toBe(true)
			})
		})

		describe('UserSelectMenuInteraction', () => {
			it('should receive user select values', async () => {
				const interactionId = generateSnowflake()
				const token = `user-select-${Date.now()}`
				const userId1 = '111111111111111111'
				const userId2 = '222222222222222222'

				const eventPromise = waitForInteraction(
					client!,
					(i) => i.isUserSelectMenu() && i.id === interactionId
				)

				await dispatchEvent(session.id, 'INTERACTION_CREATE', {
					id: interactionId,
					application_id: client!.user!.id,
					type: InteractionType.MessageComponent,
					guild_id: guildId,
					channel_id: channel.id,
					channel: {
						id: channel.id,
						type: ChannelType.GuildText,
						name: channel.name,
						guild_id: guildId
					},
					member: {
						user: { id: generateSnowflake(), username: 'TestUser', discriminator: '0000', avatar: null },
						roles: [],
						joined_at: new Date().toISOString(),
						deaf: false,
						mute: false
					},
					user: { id: generateSnowflake(), username: 'TestUser', discriminator: '0000', avatar: null },
					data: {
						custom_id: 'user_select',
						component_type: ComponentType.UserSelect,
						values: [userId1, userId2],
						resolved: {
							users: {
								[userId1]: { id: userId1, username: 'User1', discriminator: '0000', avatar: null },
								[userId2]: { id: userId2, username: 'User2', discriminator: '0000', avatar: null }
							}
						}
					},
					message: {
						id: generateSnowflake(),
						channel_id: channel.id,
						content: 'User select',
						author: { id: client!.user!.id, username: 'Bot', discriminator: '0000', avatar: null },
						timestamp: new Date().toISOString(),
						edited_timestamp: null,
						tts: false,
						mention_everyone: false,
						mentions: [],
						mention_roles: [],
						attachments: [],
						embeds: [],
						pinned: false,
						type: 0
					},
					token,
					version: 1
				})

				const interaction = (await eventPromise) as UserSelectMenuInteraction
				expect(interaction.users.size).toBe(2)
			})
		})

		describe('RoleSelectMenuInteraction', () => {
			it('should receive role select values', async () => {
				const interactionId = generateSnowflake()
				const token = `role-select-${Date.now()}`
				const roleId = '333333333333333333'

				const eventPromise = waitForInteraction(
					client!,
					(i) => i.isRoleSelectMenu() && i.id === interactionId
				)

				await dispatchEvent(session.id, 'INTERACTION_CREATE', {
					id: interactionId,
					application_id: client!.user!.id,
					type: InteractionType.MessageComponent,
					guild_id: guildId,
					channel_id: channel.id,
					channel: {
						id: channel.id,
						type: ChannelType.GuildText,
						name: channel.name,
						guild_id: guildId
					},
					member: {
						user: { id: generateSnowflake(), username: 'TestUser', discriminator: '0000', avatar: null },
						roles: [],
						joined_at: new Date().toISOString(),
						deaf: false,
						mute: false
					},
					user: { id: generateSnowflake(), username: 'TestUser', discriminator: '0000', avatar: null },
					data: {
						custom_id: 'role_select',
						component_type: ComponentType.RoleSelect,
						values: [roleId],
						resolved: {
							roles: {
								[roleId]: {
									id: roleId,
									name: 'Selected Role',
									color: 0xff0000,
									position: 1,
									permissions: '0',
									hoist: false,
									managed: false,
									mentionable: false
								}
							}
						}
					},
					message: {
						id: generateSnowflake(),
						channel_id: channel.id,
						content: 'Role select',
						author: { id: client!.user!.id, username: 'Bot', discriminator: '0000', avatar: null },
						timestamp: new Date().toISOString(),
						edited_timestamp: null,
						tts: false,
						mention_everyone: false,
						mentions: [],
						mention_roles: [],
						attachments: [],
						embeds: [],
						pinned: false,
						type: 0
					},
					token,
					version: 1
				})

				const interaction = (await eventPromise) as RoleSelectMenuInteraction
				expect(interaction.roles.size).toBe(1)
				expect(interaction.roles.first()!.name).toBe('Selected Role')
			})
		})

		describe('ChannelSelectMenuInteraction', () => {
			it('should receive channel select values', async () => {
				const interactionId = generateSnowflake()
				const token = `channel-select-${Date.now()}`

				const eventPromise = waitForInteraction(
					client!,
					(i) => i.isChannelSelectMenu() && i.id === interactionId
				)

				await dispatchEvent(session.id, 'INTERACTION_CREATE', {
					id: interactionId,
					application_id: client!.user!.id,
					type: InteractionType.MessageComponent,
					guild_id: guildId,
					channel_id: channel.id,
					channel: {
						id: channel.id,
						type: ChannelType.GuildText,
						name: channel.name,
						guild_id: guildId
					},
					member: {
						user: { id: generateSnowflake(), username: 'TestUser', discriminator: '0000', avatar: null },
						roles: [],
						joined_at: new Date().toISOString(),
						deaf: false,
						mute: false
					},
					user: { id: generateSnowflake(), username: 'TestUser', discriminator: '0000', avatar: null },
					data: {
						custom_id: 'channel_select',
						component_type: ComponentType.ChannelSelect,
						values: [channel.id],
						resolved: {
							channels: {
								[channel.id]: {
									id: channel.id,
									name: channel.name,
									type: ChannelType.GuildText,
									permissions: '0'
								}
							}
						}
					},
					message: {
						id: generateSnowflake(),
						channel_id: channel.id,
						content: 'Channel select',
						author: { id: client!.user!.id, username: 'Bot', discriminator: '0000', avatar: null },
						timestamp: new Date().toISOString(),
						edited_timestamp: null,
						tts: false,
						mention_everyone: false,
						mentions: [],
						mention_roles: [],
						attachments: [],
						embeds: [],
						pinned: false,
						type: 0
					},
					token,
					version: 1
				})

				const interaction = (await eventPromise) as ChannelSelectMenuInteraction
				expect(interaction.channels.size).toBe(1)
			})
		})

		describe('MentionableSelectMenuInteraction', () => {
			it('should receive mentionable select values', async () => {
				const interactionId = generateSnowflake()
				const token = `mentionable-select-${Date.now()}`
				const userId = '111111111111111111'
				const roleId = '333333333333333333'

				const eventPromise = waitForInteraction(
					client!,
					(i) => i.isMentionableSelectMenu() && i.id === interactionId
				)

				await dispatchEvent(session.id, 'INTERACTION_CREATE', {
					id: interactionId,
					application_id: client!.user!.id,
					type: InteractionType.MessageComponent,
					guild_id: guildId,
					channel_id: channel.id,
					channel: {
						id: channel.id,
						type: ChannelType.GuildText,
						name: channel.name,
						guild_id: guildId
					},
					member: {
						user: { id: generateSnowflake(), username: 'TestUser', discriminator: '0000', avatar: null },
						roles: [],
						joined_at: new Date().toISOString(),
						deaf: false,
						mute: false
					},
					user: { id: generateSnowflake(), username: 'TestUser', discriminator: '0000', avatar: null },
					data: {
						custom_id: 'mentionable_select',
						component_type: ComponentType.MentionableSelect,
						values: [userId, roleId],
						resolved: {
							users: {
								[userId]: { id: userId, username: 'User1', discriminator: '0000', avatar: null }
							},
							roles: {
								[roleId]: {
									id: roleId,
									name: 'Role1',
									color: 0,
									position: 0,
									permissions: '0',
									hoist: false,
									managed: false,
									mentionable: false
								}
							}
						}
					},
					message: {
						id: generateSnowflake(),
						channel_id: channel.id,
						content: 'Mentionable select',
						author: { id: client!.user!.id, username: 'Bot', discriminator: '0000', avatar: null },
						timestamp: new Date().toISOString(),
						edited_timestamp: null,
						tts: false,
						mention_everyone: false,
						mentions: [],
						mention_roles: [],
						attachments: [],
						embeds: [],
						pinned: false,
						type: 0
					},
					token,
					version: 1
				})

				const interaction = (await eventPromise) as MentionableSelectMenuInteraction
				expect(interaction.users.size).toBe(1)
				expect(interaction.roles.size).toBe(1)
			})
		})
	})

	describe('ModalSubmitInteraction', () => {
		/**
		 * Helper to dispatch a modal submit interaction
		 */
		async function dispatchModalSubmit(
			customId: string,
			components: Array<{ custom_id: string; value: string }>
		): Promise<ModalSubmitInteraction> {
			const interactionId = generateSnowflake()
			const token = `modal-token-${Date.now()}`

			const eventPromise = waitForInteraction(client!, (i) => i.isModalSubmit() && i.id === interactionId)

			await dispatchEvent(session.id, 'INTERACTION_CREATE', {
				id: interactionId,
				application_id: client!.user!.id,
				type: InteractionType.ModalSubmit,
				guild_id: guildId,
				channel_id: channel.id,
				channel: {
					id: channel.id,
					type: ChannelType.GuildText,
					name: channel.name,
					guild_id: guildId
				},
				member: {
					user: { id: generateSnowflake(), username: 'TestUser', discriminator: '0000', avatar: null },
					roles: [],
					joined_at: new Date().toISOString(),
					deaf: false,
					mute: false
				},
				user: { id: generateSnowflake(), username: 'TestUser', discriminator: '0000', avatar: null },
				data: {
					custom_id: customId,
					components: components.map((c) => ({
						type: ComponentType.ActionRow,
						components: [
							{
								type: ComponentType.TextInput,
								custom_id: c.custom_id,
								value: c.value
							}
						]
					}))
				},
				token,
				version: 1
			})

			return (await eventPromise) as ModalSubmitInteraction
		}

		it('should get text input values', async () => {
			const interaction = await dispatchModalSubmit('test_modal', [
				{ custom_id: 'name_input', value: 'John Doe' },
				{ custom_id: 'message_input', value: 'Hello, this is my message!' }
			])

			const nameValue = interaction.fields.getTextInputValue('name_input')
			const messageValue = interaction.fields.getTextInputValue('message_input')

			expect(nameValue).toBe('John Doe')
			expect(messageValue).toBe('Hello, this is my message!')
		})

		it('should reply to modal', async () => {
			const interaction = await dispatchModalSubmit('reply_modal', [{ custom_id: 'name_input', value: 'Test' }])

			await interaction.reply({
				content: `Thanks ${interaction.fields.getTextInputValue('name_input')}!`
			})

			expect(interaction.replied).toBe(true)
		})

		it('should defer modal reply', async () => {
			const interaction = await dispatchModalSubmit('defer_modal', [])

			await interaction.deferReply({ ephemeral: true })

			expect(interaction.deferred).toBe(true)
		})
	})

	describe('Showing Modals', () => {
		it('should show modal from command interaction', async () => {
			const interaction = await dispatchCommandInteraction('modal_cmd')

			const modal = new ModalBuilder()
				.setCustomId('my_modal')
				.setTitle('My Modal')
				.addComponents(
					new ActionRowBuilder<TextInputBuilder>().addComponents(
						new TextInputBuilder()
							.setCustomId('input')
							.setLabel('Enter something')
							.setStyle(TextInputStyle.Short)
					)
				)

			await interaction.showModal(modal)

			// Modal shown successfully (no error thrown)
			expect(interaction.replied).toBe(true)
		})

		it('should show modal from button interaction', async () => {
			const interaction = await dispatchButtonInteraction('show_modal_btn')

			const modal = new ModalBuilder()
				.setCustomId('btn_modal')
				.setTitle('Button Modal')
				.addComponents(
					new ActionRowBuilder<TextInputBuilder>().addComponents(
						new TextInputBuilder()
							.setCustomId('feedback')
							.setLabel('Feedback')
							.setStyle(TextInputStyle.Paragraph)
					)
				)

			await interaction.showModal(modal)

			// Modal shown successfully (no error thrown)
			expect(interaction.replied).toBe(true)
		})
	})
})
