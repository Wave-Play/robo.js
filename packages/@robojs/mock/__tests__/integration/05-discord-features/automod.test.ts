/**
 * AutoMod Tests
 *
 * Tests for auto moderation rule creation, management, and events.
 */
import {
	AutoModerationActionType,
	AutoModerationRule,
	AutoModerationRuleEventType,
	AutoModerationRuleTriggerType,
	ChannelType,
	Client,
	Events
} from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { waitForEvent, waitForReady } from '../utils/helpers.js'

describe('AutoMod', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guildId: string

	beforeAll(async () => {
		session = await createSession({
			name: 'automod-tests',
			config: {
				guilds: [
					{
						name: 'AutoMod Test Guild',
						channels: [{ name: 'automod-alerts', type: ChannelType.GuildText }]
					}
				]
			}
		})

		client = createTestClient()
		await client.login(session.token)
		await waitForReady(client)

		guildId = client.guilds.cache.first()!.id
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('Creating Rules', () => {
		it('should create keyword rule', async () => {
			const guild = client!.guilds.cache.get(guildId)!

			const rule = await guild.autoModerationRules.create({
				name: 'Test Keyword Rule',
				eventType: AutoModerationRuleEventType.MessageSend,
				triggerType: AutoModerationRuleTriggerType.Keyword,
				triggerMetadata: {
					keywordFilter: ['badword1', 'badword2']
				},
				actions: [{ type: AutoModerationActionType.BlockMessage }]
			})

			expect(rule.name).toBe('Test Keyword Rule')
			expect(rule.triggerType).toBe(AutoModerationRuleTriggerType.Keyword)
			expect(rule.triggerMetadata.keywordFilter).toContain('badword1')

			await rule.delete()
		})

		it('should create spam rule', async () => {
			const guild = client!.guilds.cache.get(guildId)!

			const rule = await guild.autoModerationRules.create({
				name: 'Test Spam Rule',
				eventType: AutoModerationRuleEventType.MessageSend,
				triggerType: AutoModerationRuleTriggerType.Spam,
				actions: [{ type: AutoModerationActionType.BlockMessage }]
			})

			expect(rule.triggerType).toBe(AutoModerationRuleTriggerType.Spam)

			await rule.delete()
		})

		it('should create mention spam rule', async () => {
			const guild = client!.guilds.cache.get(guildId)!

			const rule = await guild.autoModerationRules.create({
				name: 'Test Mention Rule',
				eventType: AutoModerationRuleEventType.MessageSend,
				triggerType: AutoModerationRuleTriggerType.MentionSpam,
				triggerMetadata: {
					mentionTotalLimit: 5
				},
				actions: [{ type: AutoModerationActionType.BlockMessage }]
			})

			expect(rule.triggerType).toBe(AutoModerationRuleTriggerType.MentionSpam)
			expect(rule.triggerMetadata.mentionTotalLimit).toBe(5)

			await rule.delete()
		})

		it('should create rule with timeout action', async () => {
			const guild = client!.guilds.cache.get(guildId)!

			const rule = await guild.autoModerationRules.create({
				name: 'Timeout Rule',
				eventType: AutoModerationRuleEventType.MessageSend,
				triggerType: AutoModerationRuleTriggerType.Keyword,
				triggerMetadata: { keywordFilter: ['timeout'] },
				actions: [
					{ type: AutoModerationActionType.BlockMessage },
					{
						type: AutoModerationActionType.Timeout,
						metadata: { durationSeconds: 60 }
					}
				]
			})

			const hasTimeout = rule.actions.some((a) => a.type === AutoModerationActionType.Timeout)
			expect(hasTimeout).toBe(true)

			await rule.delete()
		})

		it('should create rule with alert channel', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText)!

			const rule = await guild.autoModerationRules.create({
				name: 'Alert Rule',
				eventType: AutoModerationRuleEventType.MessageSend,
				triggerType: AutoModerationRuleTriggerType.Keyword,
				triggerMetadata: { keywordFilter: ['alert'] },
				actions: [
					{
						type: AutoModerationActionType.SendAlertMessage,
						metadata: { channel: channel.id }
					}
				]
			})

			const alertAction = rule.actions.find(
				(a) => a.type === AutoModerationActionType.SendAlertMessage
			)
			expect(alertAction?.metadata.channelId).toBe(channel.id)

			await rule.delete()
		})

		it('should create disabled rule', async () => {
			const guild = client!.guilds.cache.get(guildId)!

			const rule = await guild.autoModerationRules.create({
				name: 'Disabled Rule',
				eventType: AutoModerationRuleEventType.MessageSend,
				triggerType: AutoModerationRuleTriggerType.Keyword,
				triggerMetadata: { keywordFilter: ['disabled'] },
				actions: [{ type: AutoModerationActionType.BlockMessage }],
				enabled: false
			})

			expect(rule.enabled).toBe(false)

			await rule.delete()
		})
	})

	describe('Editing Rules', () => {
		let rule: AutoModerationRule

		beforeEach(async () => {
			const guild = client!.guilds.cache.get(guildId)!
			rule = await guild.autoModerationRules.create({
				name: 'Edit Rule',
				eventType: AutoModerationRuleEventType.MessageSend,
				triggerType: AutoModerationRuleTriggerType.Keyword,
				triggerMetadata: { keywordFilter: ['edit'] },
				actions: [{ type: AutoModerationActionType.BlockMessage }]
			})
		})

		afterEach(async () => {
			if (rule) {
				try {
					await rule.delete()
				} catch {
					// Rule may already be deleted
				}
			}
		})

		it('should edit rule name', async () => {
			await rule.edit({ name: 'Renamed Rule' })
			expect(rule.name).toBe('Renamed Rule')
		})

		it('should toggle rule enabled status', async () => {
			await rule.edit({ enabled: false })
			expect(rule.enabled).toBe(false)

			await rule.edit({ enabled: true })
			expect(rule.enabled).toBe(true)
		})

		it('should update keyword filter', async () => {
			await rule.edit({
				triggerMetadata: {
					keywordFilter: ['updated', 'keywords']
				}
			})

			expect(rule.triggerMetadata.keywordFilter).toContain('updated')
			expect(rule.triggerMetadata.keywordFilter).toContain('keywords')
		})

		it('should update actions', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText)!

			await rule.edit({
				actions: [
					{ type: AutoModerationActionType.BlockMessage },
					{
						type: AutoModerationActionType.SendAlertMessage,
						metadata: { channel: channel.id }
					}
				]
			})

			expect(rule.actions.length).toBe(2)
		})

		it('should use setName helper', async () => {
			await rule.setName('Helper Renamed')
			expect(rule.name).toBe('Helper Renamed')
		})
	})

	describe('Rule Exemptions', () => {
		it('should create rule with exempt roles', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const role = await guild.roles.create({ name: 'Exempt Role' })

			const rule = await guild.autoModerationRules.create({
				name: 'Exempt Role Rule',
				eventType: AutoModerationRuleEventType.MessageSend,
				triggerType: AutoModerationRuleTriggerType.Keyword,
				triggerMetadata: { keywordFilter: ['exempt'] },
				actions: [{ type: AutoModerationActionType.BlockMessage }],
				exemptRoles: [role.id]
			})

			expect(rule.exemptRoles.has(role.id)).toBe(true)

			await rule.delete()
			await role.delete()
		})

		it('should create rule with exempt channels', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText)!

			const rule = await guild.autoModerationRules.create({
				name: 'Exempt Channel Rule',
				eventType: AutoModerationRuleEventType.MessageSend,
				triggerType: AutoModerationRuleTriggerType.Keyword,
				triggerMetadata: { keywordFilter: ['exempt'] },
				actions: [{ type: AutoModerationActionType.BlockMessage }],
				exemptChannels: [channel.id]
			})

			expect(rule.exemptChannels.has(channel.id)).toBe(true)

			await rule.delete()
		})
	})

	describe('Fetching Rules', () => {
		let rule: AutoModerationRule

		beforeAll(async () => {
			const guild = client!.guilds.cache.get(guildId)!
			rule = await guild.autoModerationRules.create({
				name: 'Fetch Rule',
				eventType: AutoModerationRuleEventType.MessageSend,
				triggerType: AutoModerationRuleTriggerType.Keyword,
				triggerMetadata: { keywordFilter: ['fetch'] },
				actions: [{ type: AutoModerationActionType.BlockMessage }]
			})
		})

		afterAll(async () => {
			if (rule) {
				await rule.delete()
			}
		})

		it('should fetch all rules', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const rules = await guild.autoModerationRules.fetch()
			expect(rules.has(rule.id)).toBe(true)
		})

		it('should fetch specific rule', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const fetched = await guild.autoModerationRules.fetch(rule.id)
			expect(fetched.id).toBe(rule.id)
			expect(fetched.name).toBe('Fetch Rule')
		})
	})

	describe('Deleting Rules', () => {
		it('should delete rule', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const rule = await guild.autoModerationRules.create({
				name: 'Delete Rule',
				eventType: AutoModerationRuleEventType.MessageSend,
				triggerType: AutoModerationRuleTriggerType.Keyword,
				triggerMetadata: { keywordFilter: ['delete'] },
				actions: [{ type: AutoModerationActionType.BlockMessage }]
			})
			const ruleId = rule.id

			await rule.delete()

			await expect(guild.autoModerationRules.fetch(ruleId)).rejects.toBeDefined()
		})
	})

	describe('Rule Events', () => {
		it('should emit autoModerationRuleCreate', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const eventPromise = waitForEvent(client!, Events.AutoModerationRuleCreate)

			const rule = await guild.autoModerationRules.create({
				name: 'Event Create Rule',
				eventType: AutoModerationRuleEventType.MessageSend,
				triggerType: AutoModerationRuleTriggerType.Keyword,
				triggerMetadata: { keywordFilter: ['event'] },
				actions: [{ type: AutoModerationActionType.BlockMessage }]
			})

			const created = await eventPromise
			expect(created.id).toBe(rule.id)

			await rule.delete()
		})

		it('should emit autoModerationRuleUpdate', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const rule = await guild.autoModerationRules.create({
				name: 'Event Update Rule',
				eventType: AutoModerationRuleEventType.MessageSend,
				triggerType: AutoModerationRuleTriggerType.Keyword,
				triggerMetadata: { keywordFilter: ['update'] },
				actions: [{ type: AutoModerationActionType.BlockMessage }]
			})

			const eventPromise = new Promise<{
				oldRule: AutoModerationRule | null
				newRule: AutoModerationRule
			}>((resolve) => {
				client!.once(Events.AutoModerationRuleUpdate, (oldRule, newRule) =>
					resolve({ oldRule, newRule })
				)
			})

			await rule.edit({ name: 'Updated Rule' })
			const { oldRule, newRule } = await eventPromise

			expect(oldRule?.name).toBe('Event Update Rule')
			expect(newRule.name).toBe('Updated Rule')

			await rule.delete()
		})

		it('should emit autoModerationRuleDelete', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const rule = await guild.autoModerationRules.create({
				name: 'Event Delete Rule',
				eventType: AutoModerationRuleEventType.MessageSend,
				triggerType: AutoModerationRuleTriggerType.Keyword,
				triggerMetadata: { keywordFilter: ['delete'] },
				actions: [{ type: AutoModerationActionType.BlockMessage }]
			})
			const ruleId = rule.id

			const eventPromise = waitForEvent(client!, Events.AutoModerationRuleDelete)
			await rule.delete()

			const deleted = await eventPromise
			expect(deleted.id).toBe(ruleId)
		})
	})

	describe('Rule Properties', () => {
		it('should have guild reference', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const rule = await guild.autoModerationRules.create({
				name: 'Guild Ref Rule',
				eventType: AutoModerationRuleEventType.MessageSend,
				triggerType: AutoModerationRuleTriggerType.Keyword,
				triggerMetadata: { keywordFilter: ['guild'] },
				actions: [{ type: AutoModerationActionType.BlockMessage }]
			})

			expect(rule.guild.id).toBe(guildId)

			await rule.delete()
		})

		it('should have creator reference', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const rule = await guild.autoModerationRules.create({
				name: 'Creator Rule',
				eventType: AutoModerationRuleEventType.MessageSend,
				triggerType: AutoModerationRuleTriggerType.Keyword,
				triggerMetadata: { keywordFilter: ['creator'] },
				actions: [{ type: AutoModerationActionType.BlockMessage }]
			})

			expect(rule.creatorId).toBe(client!.user!.id)

			await rule.delete()
		})
	})
})
