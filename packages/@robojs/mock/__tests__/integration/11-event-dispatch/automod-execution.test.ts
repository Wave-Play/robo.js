/**
 * AutoMod Action Execution Tests
 *
 * Tests for autoModerationActionExecution event via dispatch.
 */
import {
	AutoModerationActionType,
	AutoModerationRuleEventType,
	AutoModerationRuleTriggerType,
	ChannelType,
	Client,
	Events,
	GatewayIntentBits,
	TextChannel
} from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { generateSnowflake, waitForReady } from '../utils/helpers.js'

describe('AutoMod Action Execution', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guildId: string
	let channelId: string

	beforeAll(async () => {
		session = await createSession({
			name: 'automod-execution-tests',
			config: {
				guilds: [
					{
						name: 'AutoMod Execution Test Guild',
						channels: [{ name: 'automod-channel', type: ChannelType.GuildText }]
					}
				]
			}
		})

		client = createTestClient({
			intents: [
				GatewayIntentBits.Guilds,
				GatewayIntentBits.AutoModerationConfiguration,
				GatewayIntentBits.AutoModerationExecution
			]
		})
		await client.login(session.token)
		await waitForReady(client)

		const guild = client.guilds.cache.first()!
		guildId = guild.id
		const channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel
		channelId = channel.id
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('Action Execution Event', () => {
		it('should emit autoModerationActionExecution', async () => {
			const guild = client!.guilds.cache.get(guildId)!

			// Create an AutoMod rule
			const rule = await guild.autoModerationRules.create({
				name: 'Execution Rule',
				eventType: AutoModerationRuleEventType.MessageSend,
				triggerType: AutoModerationRuleTriggerType.Keyword,
				triggerMetadata: { keywordFilter: ['trigger'] },
				actions: [{ type: AutoModerationActionType.BlockMessage }]
			})

			try {
				const userId = generateSnowflake()
				const messageId = generateSnowflake()

				const eventPromise = new Promise<{ ruleId: string; matchedKeyword: string | null }>((resolve, reject) => {
					const timeout = setTimeout(() => reject(new Error('Timeout waiting for event')), 5000)
					client!.once(Events.AutoModerationActionExecution, (execution) => {
						clearTimeout(timeout)
						resolve({
							ruleId: execution.ruleId,
							matchedKeyword: execution.matchedKeyword
						})
					})
				})

				await dispatchEvent(session.id, 'AUTO_MODERATION_ACTION_EXECUTION', {
					guild_id: guildId,
					action: {
						type: AutoModerationActionType.BlockMessage,
						metadata: {}
					},
					rule_id: rule.id,
					rule_trigger_type: AutoModerationRuleTriggerType.Keyword,
					user_id: userId,
					channel_id: channelId,
					message_id: messageId,
					content: 'Message with trigger word',
					matched_keyword: 'trigger',
					matched_content: 'trigger'
				})

				const result = await eventPromise

				expect(result.ruleId).toBe(rule.id)
				expect(result.matchedKeyword).toBe('trigger')
			} finally {
				await rule.delete().catch(() => {})
			}
		})
	})
})
