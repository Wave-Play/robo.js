import { useCallback, useState, useEffect } from 'react'
import { usePlaybackControls, type RecordedEvent } from '../../stores/playbackStore'
import { useStageData } from '../../hooks/useStageData'
import { useSessionDispatch, type PendingInteraction } from '../../stores/sessionStore'
import { useToaster } from '../common/Toaster'
import type { StageEventType, StageMessage, StageChannel, StageMember, StageGuild, StateSyncPayload } from '../../types/stage'
import styles from './ToolsPanel.module.css'

export function ToolsPanel() {
	const { selectedChannelId, selectedGuildId, sessionId } = useStageData()
	const sessionDispatch = useSessionDispatch()
	const { addEvents } = usePlaybackControls()
	const { showToast } = useToaster()
	const [isGenerating, setIsGenerating] = useState(false)
	const [loopProtectionEnabled, setLoopProtectionEnabled] = useState(true)

	// Rate limit simulation state
	const [rateLimitEnabled, setRateLimitEnabled] = useState(false)
	const [rateLimitRetryAfter, setRateLimitRetryAfter] = useState(1)
	const [rateLimitPersistent, setRateLimitPersistent] = useState(false)
	const [rateLimitScope, setRateLimitScope] = useState<'all' | 'messages' | 'interactions' | 'guilds' | 'channels'>('all')
	const [rateLimitTriggeredCount, setRateLimitTriggeredCount] = useState(0)

	// Detect API prefix from current URL (e.g., /mock/stage -> /mock)
	const getApiPrefix = useCallback(() => {
		const pathname = window.location.pathname
		const stageIndex = pathname.indexOf('/stage')
		return stageIndex !== -1 ? pathname.slice(0, stageIndex) : ''
	}, [])

	// Fetch initial loop protection status
	useEffect(() => {
		if (!sessionId) return

		const fetchLoopProtectionStatus = async () => {
			const apiPrefix = getApiPrefix()
			try {
				const response = await fetch(`${apiPrefix}/api/control/sessions/${sessionId}/loop-protection`)
				if (response.ok) {
					const data = await response.json()
					setLoopProtectionEnabled(data.enabled)
				}
			} catch {
				// Ignore errors - default to enabled
			}
		}

		fetchLoopProtectionStatus()
	}, [sessionId, getApiPrefix])

	// Toggle loop protection
	const toggleLoopProtection = useCallback(async () => {
		if (!sessionId) {
			showToast('No active session', 'warning')
			return
		}

		const apiPrefix = getApiPrefix()
		const newValue = !loopProtectionEnabled

		try {
			const response = await fetch(`${apiPrefix}/api/control/sessions/${sessionId}/loop-protection`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ enabled: newValue })
			})

			if (response.ok) {
				setLoopProtectionEnabled(newValue)
				showToast(`Loop protection ${newValue ? 'enabled' : 'disabled'}`, newValue ? 'success' : 'warning')
			} else {
				showToast('Failed to toggle loop protection', 'error')
			}
		} catch {
			showToast('Failed to toggle loop protection', 'error')
		}
	}, [sessionId, loopProtectionEnabled, getApiPrefix, showToast])

	// Fetch initial rate limit status
	useEffect(() => {
		if (!sessionId) return

		const fetchRateLimitStatus = async () => {
			const apiPrefix = getApiPrefix()
			try {
				const response = await fetch(`${apiPrefix}/api/control/sessions/${sessionId}/rate-limit`)
				if (response.ok) {
					const data = await response.json()
					setRateLimitEnabled(data.enabled)
					setRateLimitRetryAfter(data.retry_after)
					setRateLimitPersistent(data.persistent)
					setRateLimitScope(data.scope)
					setRateLimitTriggeredCount(data.triggered_count || 0)
				}
			} catch {
				// Ignore errors - default to disabled
			}
		}

		fetchRateLimitStatus()
	}, [sessionId, getApiPrefix])

	// Update rate limit settings
	const updateRateLimit = useCallback(async (updates: {
		enabled?: boolean
		retry_after?: number
		persistent?: boolean
		scope?: 'all' | 'messages' | 'interactions' | 'guilds' | 'channels'
	}) => {
		if (!sessionId) {
			showToast('No active session', 'warning')
			return
		}

		const apiPrefix = getApiPrefix()

		try {
			const response = await fetch(`${apiPrefix}/api/control/sessions/${sessionId}/rate-limit`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					enabled: updates.enabled ?? rateLimitEnabled,
					retry_after: updates.retry_after ?? rateLimitRetryAfter,
					persistent: updates.persistent ?? rateLimitPersistent,
					scope: updates.scope ?? rateLimitScope
				})
			})

			if (response.ok) {
				const data = await response.json()
				setRateLimitEnabled(data.enabled)
				setRateLimitRetryAfter(data.retry_after)
				setRateLimitPersistent(data.persistent)
				setRateLimitScope(data.scope)
				setRateLimitTriggeredCount(0) // Reset count on update

				if (updates.enabled !== undefined) {
					showToast(
						`Rate limit simulation ${data.enabled ? 'enabled' : 'disabled'}`,
						data.enabled ? 'warning' : 'success'
					)
				}
			} else {
				showToast('Failed to update rate limit settings', 'error')
			}
		} catch {
			showToast('Failed to update rate limit settings', 'error')
		}
	}, [sessionId, rateLimitEnabled, rateLimitRetryAfter, rateLimitPersistent, rateLimitScope, getApiPrefix, showToast])

	// Generate test data for visual testing (moved from PlaybackControls)
	const generateTestData = useCallback(async () => {
		if (!sessionId) {
			showToast('No active session. Please connect first.', 'warning')
			return
		}

		setIsGenerating(true)
		const now = Date.now()
		const testEvents: RecordedEvent[] = []
		const apiPrefix = getApiPrefix()

		// Use the currently selected channel ID for test messages
		const testChannelId = selectedChannelId || 'test_channel_001'
		const testGuildId = selectedGuildId || 'test_guild_001'

		// Test users with varied identities
		const testUser1 = {
			id: 'test_user_001',
			username: 'Alice',
			discriminator: '0001',
			avatar: null,
			bot: false
		}
		const testUser2 = {
			id: 'test_user_002',
			username: 'Bob',
			discriminator: '0002',
			avatar: null,
			bot: false
		}
		const testUser3 = {
			id: 'test_user_003',
			username: 'Charlie',
			discriminator: '0003',
			avatar: null,
			bot: false
		}
		const botUser = {
			id: 'test_bot_001',
			username: 'Robo',
			discriminator: '0000',
			avatar: null,
			bot: true
		}
		const moderatorBot = {
			id: 'test_bot_002',
			username: 'ModBot',
			discriminator: '0000',
			avatar: null,
			bot: true
		}

		// Friend users with statuses and activities for the DM/Friends list
		const friendUser1 = {
			id: 'friend_user_001',
			username: 'Luna',
			global_name: 'Luna Star',
			discriminator: '1234',
			avatar: null,
			bot: false,
			status: 'online' as const,
			activities: [{ name: 'Custom Status', type: 4, state: 'Playing some games 🎮' }]
		}
		const friendUser2 = {
			id: 'friend_user_002',
			username: 'Nova',
			global_name: 'Nova Eclipse',
			discriminator: '5678',
			avatar: null,
			bot: false,
			status: 'idle' as const,
			activities: [{ name: 'Custom Status', type: 4, state: 'AFK for a bit' }]
		}
		const friendUser3 = {
			id: 'friend_user_003',
			username: 'Cosmos',
			discriminator: '9012',
			avatar: null,
			bot: false,
			status: 'dnd' as const,
			activities: [{ name: 'Custom Status', type: 4, state: 'Do not disturb - working' }]
		}
		const friendUser4 = {
			id: 'friend_user_004',
			username: 'Stellar',
			global_name: 'Stellar Drift',
			discriminator: '3456',
			avatar: null,
			bot: false,
			status: 'online' as const,
			activities: [{ name: 'Visual Studio Code', type: 0 }]
		}
		const friendUser5 = {
			id: 'friend_user_005',
			username: 'Nebula',
			discriminator: '7890',
			avatar: null,
			bot: false,
			status: 'online' as const,
			activities: []
		}

		// DM channels (type: 1) for each friend - include recipient_ids for lookup
		const dmChannel1 = {
			id: 'dm_channel_001',
			name: 'Luna',
			type: 1,
			position: 0,
			recipient_ids: [friendUser1.id]
		}
		const dmChannel2 = {
			id: 'dm_channel_002',
			name: 'Nova',
			type: 1,
			position: 1,
			recipient_ids: [friendUser2.id]
		}
		const dmChannel3 = {
			id: 'dm_channel_003',
			name: 'Cosmos',
			type: 1,
			position: 2,
			recipient_ids: [friendUser3.id]
		}

		const dmChannels = [dmChannel1, dmChannel2, dmChannel3]

		// DM messages for each channel
		const dmMessages1: StageMessage[] = [
			{
				id: 'dm_msg_001',
				channel_id: dmChannel1.id,
				content: 'Hey! How are you doing?',
				timestamp: new Date(now - 86400000).toISOString(),
				author: friendUser1,
				embeds: [],
				components: [],
				attachments: []
			},
			{
				id: 'dm_msg_002',
				channel_id: dmChannel1.id,
				content: "I'm good! Just testing out this new Discord bot.",
				timestamp: new Date(now - 86300000).toISOString(),
				author: testUser1,
				embeds: [],
				components: [],
				attachments: []
			},
			{
				id: 'dm_msg_003',
				channel_id: dmChannel1.id,
				content: "That's awesome! Let me know if you need any help with it 🚀",
				timestamp: new Date(now - 86200000).toISOString(),
				author: friendUser1,
				embeds: [],
				components: [],
				attachments: []
			}
		]

		const dmMessages2: StageMessage[] = [
			{
				id: 'dm_msg_004',
				channel_id: dmChannel2.id,
				content: 'Did you see the announcement in the server?',
				timestamp: new Date(now - 172800000).toISOString(),
				author: friendUser2,
				embeds: [],
				components: [],
				attachments: []
			},
			{
				id: 'dm_msg_005',
				channel_id: dmChannel2.id,
				content: 'Not yet! What did I miss?',
				timestamp: new Date(now - 172700000).toISOString(),
				author: testUser1,
				embeds: [],
				components: [],
				attachments: []
			}
		]

		const dmMessages3: StageMessage[] = [
			{
				id: 'dm_msg_006',
				channel_id: dmChannel3.id,
				content: "Working on a secret project... can't share details yet 🤫",
				timestamp: new Date(now - 259200000).toISOString(),
				author: friendUser3,
				embeds: [],
				components: [],
				attachments: []
			}
		]

		// Create test members for the member list
		const testMembers: StageMember[] = [
			{ user: testUser1, nick: null, roles: [], joined_at: new Date(now - 86400000).toISOString(), guild_id: testGuildId },
			{ user: testUser2, nick: 'Bobby', roles: [], joined_at: new Date(now - 172800000).toISOString(), guild_id: testGuildId },
			{ user: testUser3, nick: null, roles: [], joined_at: new Date(now - 259200000).toISOString(), guild_id: testGuildId },
			{ user: botUser, nick: null, roles: [], joined_at: new Date(now - 604800000).toISOString(), guild_id: testGuildId },
			{ user: moderatorBot, nick: null, roles: [], joined_at: new Date(now - 604800000).toISOString(), guild_id: testGuildId }
		]

		// Create the general channel (used for test messages)
		const generalChannel: StageChannel = {
			id: testChannelId,
			name: 'general',
			type: 0,
			guild_id: testGuildId,
			position: 0,
			topic: 'Chat about anything and everything here'
		}

		// Create additional test channels
		const additionalChannels: StageChannel[] = [
			{ id: 'test_channel_announcements', name: 'announcements', type: 5, guild_id: testGuildId, position: 1, topic: 'Server news and important updates' },
			{ id: 'test_channel_bot_commands', name: 'bot-commands', type: 0, guild_id: testGuildId, position: 2, topic: 'Run bot commands here' },
			{ id: 'test_channel_off_topic', name: 'off-topic', type: 0, guild_id: testGuildId, position: 3, topic: 'Random discussions' },
			{ id: 'test_voice_general', name: 'General', type: 2, guild_id: testGuildId, position: 10 },
			{ id: 'test_voice_gaming', name: 'Gaming', type: 2, guild_id: testGuildId, position: 11 }
		]

		// All channels for state_sync (includes DM channels)
		const allChannels: StageChannel[] = [generalChannel, ...additionalChannels, ...dmChannels]

		// Test guild
		const testGuild: StageGuild = {
			id: testGuildId,
			name: 'Test Server',
			icon: null,
			owner_id: testUser1.id
		}

		// Test users for state_sync (includes friends with statuses/activities)
		const testUsers = [testUser1, testUser2, testUser3, botUser, moderatorBot, friendUser1, friendUser2, friendUser3, friendUser4, friendUser5]

		let msgId = 1000000000000000000n
		const nextMsgId = () => {
			msgId += 1n
			return msgId.toString()
		}

		// Generate comprehensive test events
		const eventSequence: { type: StageEventType; getData: (time: number) => unknown }[] = [
			// Intro messages - Alice sends two messages in a row (tests avatar grouping)
			{
				type: 'message_create',
				getData: (time) => ({
					source: 'injected',
					message: {
						id: nextMsgId(),
						channel_id: testChannelId,
						content: 'Hey everyone! 👋 Just joined the server.',
						timestamp: new Date(time).toISOString(),
						author: testUser1,
						embeds: [],
						components: [],
						attachments: [],
						reactions: [
							{ count: 3, me: false, emoji: { id: null, name: '👋' } },
							{ count: 5, me: true, emoji: { id: null, name: '🎉' } }
						]
					}
				})
			},
			{
				type: 'message_create',
				getData: (time) => ({
					source: 'injected',
					message: {
						id: nextMsgId(),
						channel_id: testChannelId,
						content: 'Looking forward to chatting with everyone!',
						timestamp: new Date(time).toISOString(),
						author: testUser1,
						embeds: [],
						components: [],
						attachments: []
					}
				})
			},
			{
				type: 'typing_start',
				getData: () => ({ user: testUser2, channel_id: testChannelId })
			},
			{
				type: 'message_create',
				getData: (time) => ({
					source: 'injected',
					message: {
						id: nextMsgId(),
						channel_id: testChannelId,
						content: 'Welcome! Check out the **rules** channel first.',
						timestamp: new Date(time).toISOString(),
						author: testUser2,
						embeds: [],
						components: [],
						attachments: [],
						reactions: [
							{ count: 2, me: false, emoji: { id: null, name: '👍' } }
						]
					}
				})
			},
			{
				type: 'message_create',
				getData: (time) => ({
					source: 'injected',
					message: {
						id: nextMsgId(),
						channel_id: testChannelId,
						content: 'Also, feel free to ask any questions in #bot-commands',
						timestamp: new Date(time).toISOString(),
						author: testUser2,
						embeds: [],
						components: [],
						attachments: []
					}
				})
			},
			{
				type: 'message_create',
				getData: (time) => ({
					source: 'injected',
					message: {
						id: nextMsgId(),
						channel_id: testChannelId,
						content: 'Here\'s some **bold**, *italic*, ~~strikethrough~~, and `inline code`.',
						timestamp: new Date(time).toISOString(),
						author: testUser3,
						embeds: [],
						components: [],
						attachments: []
					}
				})
			},
			{
				type: 'message_create',
				getData: (time) => ({
					source: 'injected',
					message: {
						id: nextMsgId(),
						channel_id: testChannelId,
						content: '```js\nconst greeting = "Hello, World!";\nconsole.log(greeting);\n```',
						timestamp: new Date(time).toISOString(),
						author: testUser3,
						embeds: [],
						components: [],
						attachments: []
					}
				})
			},
			{
				type: 'message_create',
				getData: (time) => ({
					source: 'injected',
					message: {
						id: nextMsgId(),
						channel_id: testChannelId,
						content: 'And here\'s a link: https://robojs.dev',
						timestamp: new Date(time).toISOString(),
						author: testUser3,
						embeds: [],
						components: [],
						attachments: []
					}
				})
			},
			{
				type: 'interaction_create',
				getData: () => ({ interaction: { name: 'help', type: 1, user: testUser1 } })
			},
			{
				type: 'interaction_response',
				getData: () => ({ interactionId: 'int_001', type: 4 })
			},
			{
				type: 'message_create',
				getData: (time) => ({
					source: 'bot',
					message: {
						id: nextMsgId(),
						channel_id: testChannelId,
						content: '',
						timestamp: new Date(time).toISOString(),
						author: botUser,
						embeds: [{
							title: '📚 Help Menu',
							description: 'Welcome to **Robo**! Use the buttons below to navigate.',
							color: 5793266,
							fields: [
								{ name: '/help', value: 'Show this menu', inline: true },
								{ name: '/ping', value: 'Check latency', inline: true },
								{ name: '/info', value: 'Bot information', inline: true },
								{ name: '/poll', value: 'Create a poll', inline: true },
								{ name: '/remind', value: 'Set a reminder', inline: true },
								{ name: '/stats', value: 'Server stats', inline: true }
							],
							footer: { text: 'Robo.js • Click a button for more details' }
						}],
						components: [
							{
								type: 1,
								components: [
									{ type: 2, style: 1, label: 'Open Modal', custom_id: 'test_modal', emoji: { name: '📝' } },
									{ type: 2, style: 2, label: 'Settings', custom_id: 'help_settings', emoji: { name: '⚙️' } },
									{ type: 2, style: 3, label: 'Support', custom_id: 'help_support', emoji: { name: '💬' } },
									{ type: 2, style: 5, label: 'Website', url: 'https://robojs.dev' }
								]
							}
						],
						attachments: []
					}
				})
			},
			{
				type: 'message_create',
				getData: (time) => ({
					source: 'injected',
					message: {
						id: nextMsgId(),
						channel_id: testChannelId,
						content: 'Check out this cool screenshot!',
						timestamp: new Date(time).toISOString(),
						author: testUser2,
						embeds: [],
						components: [],
						attachments: [
							{
								id: 'attach_001',
								filename: 'screenshot.png',
								size: 245678,
								url: 'https://picsum.photos/400/300',
								proxy_url: 'https://picsum.photos/400/300',
								width: 400,
								height: 300,
								content_type: 'image/png'
							}
						]
					}
				})
			},
			{
				type: 'interaction_create',
				getData: () => ({ interaction: { name: 'poll', type: 1, user: testUser1 } })
			},
			{
				type: 'interaction_response',
				getData: () => ({ interactionId: 'int_002', type: 4 })
			},
			{
				type: 'message_create',
				getData: (time) => ({
					source: 'bot',
					message: {
						id: nextMsgId(),
						channel_id: testChannelId,
						content: '',
						timestamp: new Date(time).toISOString(),
						author: botUser,
						embeds: [{
							title: '📊 What should we do for the next event?',
							description: 'Vote using the dropdown below!',
							color: 3447003,
							fields: [
								{ name: '🎮 Gaming Night', value: '3 votes', inline: true },
								{ name: '🎬 Movie Night', value: '5 votes', inline: true },
								{ name: '🎤 Karaoke', value: '2 votes', inline: true }
							],
							footer: { text: 'Poll ends in 24 hours • 10 total votes' }
						}],
						components: [
							{
								type: 1,
								components: [
									{
										type: 3,
										custom_id: 'poll_vote',
										placeholder: 'Cast your vote...',
										options: [
											{ label: 'Gaming Night', value: 'gaming', emoji: { name: '🎮' } },
											{ label: 'Movie Night', value: 'movie', emoji: { name: '🎬' } },
											{ label: 'Karaoke', value: 'karaoke', emoji: { name: '🎤' } }
										]
									}
								]
							}
						],
						attachments: []
					}
				})
			},
			{
				type: 'typing_start',
				getData: () => ({ user: testUser3, channel_id: testChannelId })
			},
			{
				type: 'message_create',
				getData: (time) => ({
					source: 'injected',
					message: {
						id: nextMsgId(),
						channel_id: testChannelId,
						content: 'https://github.com/Wave-Play/robo.js',
						timestamp: new Date(time).toISOString(),
						author: testUser3,
						embeds: [{
							type: 'rich',
							title: 'Wave-Play/robo.js',
							description: '⚡ Turbocharge Discord with effortless bots, apps, web servers, and more!',
							url: 'https://github.com/Wave-Play/robo.js',
							color: 2105893,
							thumbnail: {
								url: 'https://repository-images.githubusercontent.com/602877382/main',
								width: 200,
								height: 200
							},
							author: {
								name: 'GitHub',
								icon_url: 'https://github.githubassets.com/favicons/favicon.svg'
							},
							footer: { text: 'TypeScript • ⭐ 500+ stars' }
						}],
						components: [],
						attachments: []
					}
				})
			},
			{
				type: 'message_create',
				getData: (time) => ({
					source: 'bot',
					message: {
						id: nextMsgId(),
						channel_id: testChannelId,
						content: '',
						timestamp: new Date(time).toISOString(),
						author: moderatorBot,
						embeds: [{
							title: '⚠️ Auto-Moderation',
							description: 'A message was automatically flagged for review.',
							color: 15158332,
							fields: [
								{ name: 'Reason', value: 'Spam detection', inline: true },
								{ name: 'Action', value: 'Warning issued', inline: true }
							],
							footer: { text: 'ModBot • Keeping the server safe' }
						}],
						components: [
							{
								type: 1,
								components: [
									{ type: 2, style: 4, label: 'Appeal', custom_id: 'mod_appeal', emoji: { name: '📝' } },
									{ type: 2, style: 2, label: 'Dismiss', custom_id: 'mod_dismiss' }
								]
							}
						],
						attachments: []
					}
				})
			},
			{
				type: 'interaction_create',
				getData: () => ({ interaction: { name: 'ping', type: 1, user: testUser2 } })
			},
			{
				type: 'interaction_response',
				getData: () => ({ interactionId: 'int_003', type: 4 })
			},
			{
				type: 'message_create',
				getData: (time) => ({
					source: 'bot',
					message: {
						id: nextMsgId(),
						channel_id: testChannelId,
						content: '🏓 Pong!',
						timestamp: new Date(time).toISOString(),
						author: botUser,
						embeds: [{
							color: 3066993,
							fields: [
								{ name: '📡 Latency', value: '`42ms`', inline: true },
								{ name: '🌐 API', value: '`87ms`', inline: true },
								{ name: '💾 Database', value: '`12ms`', inline: true }
							]
						}],
						components: [],
						attachments: []
					}
				})
			},
			{
				type: 'message_create',
				getData: (time) => ({
					source: 'injected',
					message: {
						id: nextMsgId(),
						channel_id: testChannelId,
						content: '> The best time to plant a tree was 20 years ago.\n> The second best time is now.\n\nWise words! 🌳',
						timestamp: new Date(time).toISOString(),
						author: testUser1,
						embeds: [],
						components: [],
						attachments: []
					}
				})
			},
			{
				type: 'message_create',
				getData: (time) => ({
					source: 'injected',
					message: {
						id: nextMsgId(),
						channel_id: testChannelId,
						content: 'Some pics from the hackathon 📸',
						timestamp: new Date(time).toISOString(),
						author: testUser2,
						embeds: [],
						components: [],
						attachments: [
							{
								id: 'attach_002',
								filename: 'hackathon1.jpg',
								size: 189234,
								url: 'https://picsum.photos/300/200?random=1',
								proxy_url: 'https://picsum.photos/300/200?random=1',
								width: 300,
								height: 200,
								content_type: 'image/jpeg'
							},
							{
								id: 'attach_003',
								filename: 'hackathon2.jpg',
								size: 234567,
								url: 'https://picsum.photos/300/200?random=2',
								proxy_url: 'https://picsum.photos/300/200?random=2',
								width: 300,
								height: 200,
								content_type: 'image/jpeg'
							}
						]
					}
				})
			},
			{
				type: 'message_create',
				getData: (time) => ({
					source: 'bot',
					message: {
						id: nextMsgId(),
						channel_id: testChannelId,
						content: '',
						timestamp: new Date(time).toISOString(),
						author: botUser,
						embeds: [{
							title: '🎭 Role Selection',
							description: 'Pick your interests to unlock channels!',
							color: 10181046,
							fields: [
								{ name: 'Available Roles', value: '🎮 Gamer\n💻 Developer\n🎨 Artist\n🎵 Music Lover' }
							]
						}],
						components: [
							{
								type: 1,
								components: [
									{
										type: 3,
										custom_id: 'role_select',
										placeholder: 'Select your roles...',
										min_values: 1,
										max_values: 4,
										options: [
											{ label: 'Gamer', value: 'gamer', emoji: { name: '🎮' }, description: 'Gaming discussions' },
											{ label: 'Developer', value: 'dev', emoji: { name: '💻' }, description: 'Coding & tech' },
											{ label: 'Artist', value: 'artist', emoji: { name: '🎨' }, description: 'Art & creativity' },
											{ label: 'Music Lover', value: 'music', emoji: { name: '🎵' }, description: 'Music channels' }
										]
									}
								]
							}
						],
						attachments: []
					}
				})
			},
			{
				type: 'interaction_create',
				getData: () => ({ interaction: { name: 'stats', type: 1, user: testUser3 } })
			},
			{
				type: 'interaction_response',
				getData: () => ({ interactionId: 'int_004', type: 4 })
			},
			{
				type: 'message_create',
				getData: (time) => ({
					source: 'bot',
					message: {
						id: nextMsgId(),
						channel_id: testChannelId,
						content: '',
						timestamp: new Date(time).toISOString(),
						author: botUser,
						embeds: [{
							title: '📊 Server Statistics',
							color: 15844367,
							fields: [
								{ name: '👥 Members', value: '`1,234`', inline: true },
								{ name: '🟢 Online', value: '`456`', inline: true },
								{ name: '💬 Messages', value: '`5,678`', inline: true },
								{ name: '📂 Channels', value: '`24`', inline: true },
								{ name: '🏷️ Roles', value: '`18`', inline: true },
								{ name: '😀 Emojis', value: '`50`', inline: true }
							],
							thumbnail: {
								url: 'https://picsum.photos/100/100?random=3',
								width: 100,
								height: 100
							},
							footer: { text: 'Last updated' },
							timestamp: new Date(time).toISOString()
						}],
						components: [],
						attachments: []
					}
				})
			},
			{
				type: 'typing_start',
				getData: () => ({ user: testUser1, channel_id: testChannelId })
			},
			{
				type: 'message_create',
				getData: (time) => ({
					source: 'injected',
					message: {
						id: nextMsgId(),
						channel_id: testChannelId,
						content: 'This mock server is amazing! 🎉',
						timestamp: new Date(time).toISOString(),
						author: testUser1,
						embeds: [],
						components: [],
						attachments: []
					}
				})
			},
			{
				type: 'message_create',
				getData: (time) => ({
					source: 'injected',
					message: {
						id: nextMsgId(),
						channel_id: testChannelId,
						content: 'Time to **ship it** 🚀',
						timestamp: new Date(time).toISOString(),
						author: testUser2,
						embeds: [],
						components: [],
						attachments: []
					}
				})
			},
			{
				type: 'message_create',
				getData: (time) => ({
					source: 'injected',
					message: {
						id: nextMsgId(),
						channel_id: testChannelId,
						content: 'Let\'s goooo! 🎊🎊🎊',
						timestamp: new Date(time).toISOString(),
						author: testUser3,
						embeds: [],
						components: [],
						attachments: []
					}
				})
			},
			// Phase 5O: Edited message test
			{
				type: 'message_create',
				getData: (time) => ({
					source: 'injected',
					message: {
						id: nextMsgId(),
						channel_id: testChannelId,
						content: 'This message was edited (hover over "edited" to see timestamp)',
						timestamp: new Date(time - 60000).toISOString(), // 1 minute ago
						edited_timestamp: new Date(time).toISOString(),
						author: testUser1,
						embeds: [],
						components: [],
						attachments: []
					}
				})
			},
			// Phase 5O: Ephemeral message test (only you can see this)
			{
				type: 'message_create',
				getData: (time) => ({
					source: 'bot',
					message: {
						id: nextMsgId(),
						channel_id: testChannelId,
						content: '🔒 This is an **ephemeral message** - only visible to you!',
						timestamp: new Date(time).toISOString(),
						author: botUser,
						embeds: [{
							color: 5793266,
							description: 'Ephemeral messages are private responses that only the command invoker can see. They appear with a special indicator.',
							footer: { text: 'This message will disappear when you dismiss it or refresh' }
						}],
						components: [],
						attachments: [],
						flags: 64 // EPHEMERAL flag
					}
				})
			}
		]

		// Create state_sync event as the very first event (for playback mode)
		const stateSyncPayload: StateSyncPayload = {
			session: {
				id: 'test_session_001',
				createdAt: now,
				bot: botUser
			},
			guilds: [testGuild],
			channels: allChannels,
			members: testMembers,
			roles: [],
			messages: {},
			users: testUsers,
			commands: [],
			voice_states: [],
			currentUser: testUser1
		}

		// Add state_sync as the first event
		testEvents.push({
			id: 'test_state_sync',
			seq: 0,
			type: 'state_sync' as StageEventType,
			timestamp: now,
			data: stateSyncPayload
		})

		// Spread events over 45 seconds with varying intervals
		let time = now
		eventSequence.forEach((event, index) => {
			time += 1000 + Math.random() * 2000 // 1-3 seconds between events
			testEvents.push({
				id: `test_${index + 1}`,
				seq: index + 1,
				type: event.type,
				timestamp: time,
				data: event.getData(time)
			})
		})

		// Add to playback store for playback mode
		addEvents(testEvents)

		// Also inject messages into session store for live mode interaction
		const messages: StageMessage[] = testEvents
			.filter((e) => e.type === 'message_create')
			.map((e) => {
				const data = e.data as { message: StageMessage }
				return data.message
			})

		// Dispatch to server-side session for interactions to work
		// This creates the data in the mock server's state
		const baseUrl = `${apiPrefix}/api/control/sessions/${sessionId}`
		try {
			// First, create the guild with channels if we're using test IDs
			// (Skip if using existing selected channel/guild)
			if (!selectedGuildId || !selectedChannelId) {
				await fetch(`${baseUrl}/dispatch`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						event: 'GUILD_CREATE',
						data: {
							id: testGuildId,
							name: testGuild.name,
							icon: null,
							owner_id: testUser1.id,
							member_count: testMembers.length,
							channels: allChannels.map(c => ({
								id: c.id,
								type: c.type,
								name: c.name,
								position: c.position,
								guild_id: c.guild_id,
								topic: c.topic
							})),
							roles: [],
							members: testMembers.map(m => ({
								user: m.user,
								nick: m.nick ?? null,
								roles: m.roles,
								joined_at: m.joined_at
							}))
						}
					})
				})
				// Small delay to let state propagate
				await new Promise(resolve => setTimeout(resolve, 100))
			}

			// Then create messages
			for (const message of messages) {
				await fetch(`${baseUrl}/dispatch`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						event: 'MESSAGE_CREATE',
						data: {
							id: message.id,
							channel_id: message.channel_id,
							content: message.content,
							author: message.author,
							embeds: message.embeds,
							attachments: message.attachments,
							components: message.components,
							reactions: message.reactions
						}
					})
				})
				// Small delay between messages
				await new Promise(resolve => setTimeout(resolve, 30))
			}
		} catch (error) {
			console.warn('Failed to dispatch test data to server:', error)
		}

		if (messages.length > 0 && testChannelId) {
			sessionDispatch({
				type: 'INJECT_MESSAGES',
				payload: { channelId: testChannelId, messages }
			})
		}

		// Inject test members into session store for member list
		sessionDispatch({
			type: 'INJECT_MEMBERS',
			payload: testMembers
		})

		// Inject friend users into session store for DM/Friends list
		sessionDispatch({
			type: 'INJECT_USERS',
			payload: [friendUser1, friendUser2, friendUser3, friendUser4, friendUser5]
		})

		// Inject additional test channels into session store
		sessionDispatch({
			type: 'INJECT_CHANNELS',
			payload: additionalChannels
		})

		// Inject DM channels for friends
		sessionDispatch({
			type: 'INJECT_CHANNELS',
			payload: dmChannels
		})

		// Inject DM messages for each DM channel
		sessionDispatch({
			type: 'INJECT_MESSAGES',
			payload: { channelId: dmChannel1.id, messages: dmMessages1 }
		})
		sessionDispatch({
			type: 'INJECT_MESSAGES',
			payload: { channelId: dmChannel2.id, messages: dmMessages2 }
		})
		sessionDispatch({
			type: 'INJECT_MESSAGES',
			payload: { channelId: dmChannel3.id, messages: dmMessages3 }
		})

		setIsGenerating(false)
		showToast('Test data generated successfully!', 'success')
	}, [addEvents, getApiPrefix, selectedChannelId, selectedGuildId, sessionDispatch, sessionId, showToast])

	return (
		<div className={styles.container}>
			{/* Test Data Section */}
			<section className={styles.section}>
				<h3 className={styles.sectionTitle}>Test Data</h3>
				<p className={styles.description}>
					Generate sample messages, users, and channels for testing the Stage UI.
				</p>
				<button
					className={styles.actionButton}
					onClick={generateTestData}
					disabled={isGenerating}
				>
					<BeakerIcon />
					{isGenerating ? 'Generating...' : 'Generate Test Data'}
				</button>
			</section>

			{/* Loop Protection Settings */}
			<section className={styles.section}>
				<h3 className={styles.sectionTitle}>
					<ShieldIcon /> Loop Protection
				</h3>
				<p className={styles.description}>
					Detects and prevents infinite loops when bots respond to their own MESSAGE_CREATE events.
				</p>
				<div className={styles.toggleRow}>
					<label className={styles.toggleLabel}>
						<span>Status</span>
						<button
							className={`${styles.toggleButton} ${loopProtectionEnabled ? styles.enabled : styles.disabled}`}
							onClick={toggleLoopProtection}
							title={loopProtectionEnabled ? 'Click to disable loop protection' : 'Click to enable loop protection'}
						>
							<span className={styles.toggleIcon}>
								{loopProtectionEnabled ? <ToggleCheckIcon /> : <ToggleOffIcon />}
							</span>
							<span className={styles.toggleText}>
								{loopProtectionEnabled ? 'Enabled' : 'Disabled'}
							</span>
						</button>
					</label>
				</div>
				{!loopProtectionEnabled && (
					<p className={styles.warning}>
						Loop protection is disabled. The server will not prevent infinite loops.
					</p>
				)}
			</section>

			{/* Rate Limit Simulation */}
			<section className={styles.section}>
				<h3 className={styles.sectionTitle}>
					<ClockIcon /> Rate Limit Simulation
				</h3>
				<p className={styles.description}>
					Simulate Discord API rate limits to test bot retry logic.
				</p>
				<div className={styles.toggleRow}>
					<label className={styles.toggleLabel}>
						<span>Status</span>
						<button
							className={`${styles.toggleButton} ${rateLimitEnabled ? styles.enabled : styles.disabled}`}
							onClick={() => updateRateLimit({ enabled: !rateLimitEnabled })}
							title={rateLimitEnabled ? 'Click to disable rate limit' : 'Click to enable rate limit'}
						>
							<span className={styles.toggleIcon}>
								{rateLimitEnabled ? <ToggleCheckIcon /> : <ToggleOffIcon />}
							</span>
							<span className={styles.toggleText}>
								{rateLimitEnabled ? 'Active' : 'Disabled'}
							</span>
						</button>
					</label>
				</div>
				<div className={styles.inputRow}>
					<span>Retry After</span>
					<input
						type="number"
						min={1}
						max={60}
						value={rateLimitRetryAfter}
						onChange={(e) => {
							const value = Math.max(1, Math.min(60, parseInt(e.target.value) || 1))
							setRateLimitRetryAfter(value)
							updateRateLimit({ retry_after: value })
						}}
						title="Retry-After value in seconds"
					/>
					<span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>sec</span>
				</div>
				<div className={styles.toggleRow}>
					<label className={styles.toggleLabel}>
						<span>Mode</span>
						<button
							className={`${styles.toggleButton} ${rateLimitPersistent ? styles.enabled : styles.disabled}`}
							onClick={() => updateRateLimit({ persistent: !rateLimitPersistent })}
							title={rateLimitPersistent ? 'Persistent: keeps returning 429' : 'One-shot: auto-disables after first 429'}
						>
							<span className={styles.toggleText}>
								{rateLimitPersistent ? 'Persistent' : 'One-shot'}
							</span>
						</button>
					</label>
				</div>
				<div className={styles.selectRow}>
					<span>Scope</span>
					<select
						value={rateLimitScope}
						onChange={(e) => updateRateLimit({ scope: e.target.value as typeof rateLimitScope })}
						title="Which endpoints to rate limit"
					>
						<option value="all">All Endpoints</option>
						<option value="messages">Messages</option>
						<option value="interactions">Interactions</option>
						<option value="guilds">Guilds</option>
						<option value="channels">Channels</option>
					</select>
				</div>
				{rateLimitEnabled && (
					<div className={styles.activeIndicator}>
						<span className={styles.pulsingDot} />
						<span>
							Rate limit active - next {rateLimitScope === 'all' ? '' : rateLimitScope + ' '}request returns 429
							{rateLimitTriggeredCount > 0 && ` (triggered ${rateLimitTriggeredCount}×)`}
						</span>
					</div>
				)}
			</section>

			{/* Phase 5O: Visual States Testing */}
			<section className={styles.section}>
				<h3 className={styles.sectionTitle}>Message States (Phase 5O)</h3>
				<p className={styles.description}>
					Test ephemeral messages, edited indicators, and loading states.
				</p>
				<div className={`${styles.buttonGroup} ${styles.buttonGroupStack}`}>
					<button
						className={styles.actionButton}
						onClick={() => {
							if (!selectedChannelId) {
								showToast('Select a channel first', 'warning')
								return
							}
							// Add a "Bot is thinking..." indicator
							const pendingInteraction: PendingInteraction = {
								id: `thinking_${Date.now()}`,
								channelId: selectedChannelId,
								botName: 'Robo',
								botAvatar: null,
								botId: 'test_bot_001',
								createdAt: Date.now()
							}
							sessionDispatch({ type: 'ADD_PENDING_INTERACTION', payload: pendingInteraction })
							showToast('Added "Bot is thinking..." indicator', 'info')
							// Auto-remove after 5 seconds
							setTimeout(() => {
								sessionDispatch({ type: 'REMOVE_PENDING_INTERACTION', payload: { id: pendingInteraction.id } })
							}, 5000)
						}}
					>
						<ThinkingIcon />
						Show "Bot is thinking..."
					</button>
					<button
						className={styles.actionButton}
						onClick={() => {
							if (!selectedChannelId) {
								showToast('Select a channel first', 'warning')
								return
							}
							// Add a failed pending message
							sessionDispatch({
								type: 'ADD_PENDING_MESSAGE',
								payload: {
									id: `failed_${Date.now()}`,
									content: 'This message failed to send (test)',
									channelId: selectedChannelId,
									state: 'failed',
									error: 'Network error: Connection timeout',
									author: { id: 'user_0', username: 'You', avatar: null },
									createdAt: Date.now()
								}
							})
							showToast('Added failed message indicator', 'info')
						}}
					>
						<ErrorIcon />
						Show Failed Message
					</button>
				</div>
			</section>

			{/* Phase 5P: Voice States Testing */}
			<section className={styles.section}>
				<h3 className={styles.sectionTitle}>Voice States (Phase 5P)</h3>
				<p className={styles.description}>
					Test voice channel member display and state indicators. Click &quot;Generate Test Data&quot; first to create voice channels.
				</p>
				<div className={`${styles.buttonGroup} ${styles.buttonGroupStack}`}>
					<button
						className={styles.actionButton}
						onClick={async () => {
							if (!sessionId || !selectedGuildId) {
								showToast('No active session or guild selected', 'warning')
								return
							}
							const apiPrefix = getApiPrefix()
							const baseUrl = `${apiPrefix}/api/control/sessions/${sessionId}`

							// Find a voice channel in the current state
							const voiceChannelId = 'test_voice_general'

							// Add Alice to voice channel
							try {
								await fetch(`${baseUrl}/dispatch`, {
									method: 'POST',
									headers: { 'Content-Type': 'application/json' },
									body: JSON.stringify({
										event: 'VOICE_STATE_UPDATE',
										data: {
											guild_id: selectedGuildId,
											channel_id: voiceChannelId,
											user_id: 'test_user_001',
											self_mute: false,
											self_deaf: false,
											mute: false,
											deaf: false,
											member: {
												user: { id: 'test_user_001', username: 'Alice', discriminator: '0001', avatar: null },
												roles: [],
												joined_at: new Date().toISOString()
											}
										}
									})
								})
								showToast('Alice joined voice channel', 'success')
							} catch (error) {
								showToast('Failed to add user to voice', 'error')
							}
						}}
					>
						<VoiceIcon />
						Add User to Voice
					</button>
					<button
						className={styles.actionButton}
						onClick={async () => {
							if (!sessionId || !selectedGuildId) {
								showToast('No active session or guild selected', 'warning')
								return
							}
							const apiPrefix = getApiPrefix()
							const baseUrl = `${apiPrefix}/api/control/sessions/${sessionId}`
							const voiceChannelId = 'test_voice_general'

							// Add multiple users with various states
							const voiceUsers = [
								{ user_id: 'test_user_001', username: 'Alice', nick: null, self_mute: false, self_deaf: false },
								{ user_id: 'test_user_002', username: 'Bob', nick: 'Bobby', self_mute: true, self_deaf: false },
								{ user_id: 'test_user_003', username: 'Charlie', nick: null, self_mute: false, self_deaf: true }
							]

							try {
								for (const vu of voiceUsers) {
									await fetch(`${baseUrl}/dispatch`, {
										method: 'POST',
										headers: { 'Content-Type': 'application/json' },
										body: JSON.stringify({
											event: 'VOICE_STATE_UPDATE',
											data: {
												guild_id: selectedGuildId,
												channel_id: voiceChannelId,
												user_id: vu.user_id,
												self_mute: vu.self_mute,
												self_deaf: vu.self_deaf,
												mute: false,
												deaf: false,
												member: {
													user: { id: vu.user_id, username: vu.username, discriminator: '0001', avatar: null },
													nick: vu.nick,
													roles: [],
													joined_at: new Date().toISOString()
												}
											}
										})
									})
									await new Promise(r => setTimeout(r, 50))
								}
								showToast('Multiple users joined voice channel', 'success')
							} catch (error) {
								showToast('Failed to add users to voice', 'error')
							}
						}}
					>
						<VoiceGroupIcon />
						Add Multiple Users
					</button>
					<button
						className={styles.actionButton}
						onClick={async () => {
							if (!sessionId || !selectedGuildId) {
								showToast('No active session or guild selected', 'warning')
								return
							}
							const apiPrefix = getApiPrefix()
							const baseUrl = `${apiPrefix}/api/control/sessions/${sessionId}`

							// Remove user from voice (set channel_id to null)
							try {
								await fetch(`${baseUrl}/dispatch`, {
									method: 'POST',
									headers: { 'Content-Type': 'application/json' },
									body: JSON.stringify({
										event: 'VOICE_STATE_UPDATE',
										data: {
											guild_id: selectedGuildId,
											channel_id: null,
											user_id: 'test_user_001',
											self_mute: false,
											self_deaf: false,
											mute: false,
											deaf: false
										}
									})
								})
								showToast('User left voice channel', 'success')
							} catch (error) {
								showToast('Failed to remove user from voice', 'error')
							}
						}}
					>
						<LeaveVoiceIcon />
						Remove User from Voice
					</button>
					<button
						className={styles.actionButton}
						onClick={async () => {
							if (!sessionId || !selectedGuildId) {
								showToast('No active session or guild selected', 'warning')
								return
							}
							const apiPrefix = getApiPrefix()
							const baseUrl = `${apiPrefix}/api/control/sessions/${sessionId}`
							const voiceChannelId = 'test_voice_general'

							// Toggle speaking state for Alice (simulated)
							try {
								await fetch(`${baseUrl}/dispatch`, {
									method: 'POST',
									headers: { 'Content-Type': 'application/json' },
									body: JSON.stringify({
										event: 'VOICE_STATE_UPDATE',
										data: {
											guild_id: selectedGuildId,
											channel_id: voiceChannelId,
											user_id: 'test_user_001',
											self_mute: false,
											self_deaf: false,
											mute: false,
											deaf: false,
											speaking: true,
											member: {
												user: { id: 'test_user_001', username: 'Alice', discriminator: '0001', avatar: null },
												roles: [],
												joined_at: new Date().toISOString()
											}
										}
									})
								})
								showToast('Simulating Alice speaking...', 'success')
								// Auto-stop speaking after 3 seconds
								setTimeout(async () => {
									try {
										await fetch(`${baseUrl}/dispatch`, {
											method: 'POST',
											headers: { 'Content-Type': 'application/json' },
											body: JSON.stringify({
												event: 'VOICE_STATE_UPDATE',
												data: {
													guild_id: selectedGuildId,
													channel_id: voiceChannelId,
													user_id: 'test_user_001',
													self_mute: false,
													self_deaf: false,
													mute: false,
													deaf: false,
													speaking: false,
													member: {
														user: { id: 'test_user_001', username: 'Alice', discriminator: '0001', avatar: null },
														roles: [],
														joined_at: new Date().toISOString()
													}
												}
											})
										})
									} catch {
										// Ignore errors when stopping
									}
								}, 3000)
							} catch (error) {
								showToast('Failed to simulate speaking', 'error')
							}
						}}
					>
						<SpeakingIcon />
						Simulate Speaking
					</button>
				</div>
			</section>

			{/* Phase 5Q: Components V2 Testing */}
			<section className={styles.section}>
				<h3 className={styles.sectionTitle}>Components V2 (Phase 5Q)</h3>
				<p className={styles.description}>
					Test Discord Components V2 message format with TextDisplay, Section, MediaGallery, Container, and more.
				</p>
				<div className={`${styles.buttonGroup} ${styles.buttonGroupStack}`}>
					<button
						className={styles.actionButton}
						onClick={async () => {
							if (!sessionId || !selectedChannelId) {
								showToast('Select a channel first', 'warning')
								return
							}
							const apiPrefix = getApiPrefix()
							const baseUrl = `${apiPrefix}/api/control/sessions/${sessionId}`

							// TextDisplay + Separator message
							const v2Message1 = {
								id: `v2_${Date.now()}_1`,
								channel_id: selectedChannelId,
								content: '', // V2 replaces content
								timestamp: new Date().toISOString(),
								author: { id: 'test_bot_001', username: 'Robo', discriminator: '0000', avatar: null, bot: true },
								embeds: [], // V2 replaces embeds
								attachments: [],
								flags: 32768, // IS_COMPONENTS_V2
								components: [
									{ type: 10, content: '# Welcome to Components V2! 🎉' },
									{ type: 10, content: 'This message uses the new **Components V2** format introduced in Discord April 2025.' },
									{ type: 14, divider: true, spacing: 'large' },
									{ type: 10, content: '### Features\n- TextDisplay with markdown\n- Separators with spacing options\n- Sections with accessories\n- Media galleries\n- Containers with accent colors' }
								]
							}

							try {
								await fetch(`${baseUrl}/dispatch`, {
									method: 'POST',
									headers: { 'Content-Type': 'application/json' },
									body: JSON.stringify({
										event: 'MESSAGE_CREATE',
										data: v2Message1
									})
								})
								sessionDispatch({
									type: 'INJECT_MESSAGES',
									payload: { channelId: selectedChannelId, messages: [v2Message1 as StageMessage] }
								})
								showToast('TextDisplay + Separator message created', 'success')
							} catch (error) {
								showToast('Failed to create V2 message', 'error')
							}
						}}
					>
						<ComponentsIcon />
						TextDisplay + Separator
					</button>
					<button
						className={styles.actionButton}
						onClick={async () => {
							if (!sessionId || !selectedChannelId) {
								showToast('Select a channel first', 'warning')
								return
							}
							const apiPrefix = getApiPrefix()
							const baseUrl = `${apiPrefix}/api/control/sessions/${sessionId}`

							// Section with Thumbnail accessory
							const v2Message2 = {
								id: `v2_${Date.now()}_2`,
								channel_id: selectedChannelId,
								content: '',
								timestamp: new Date().toISOString(),
								author: { id: 'test_bot_001', username: 'Robo', discriminator: '0000', avatar: null, bot: true },
								embeds: [],
								attachments: [],
								flags: 32768,
								components: [
									{
										type: 9, // Section
										components: [
											{ type: 10, content: '## Robo.js Framework' },
											{ type: 10, content: 'Build powerful Discord bots, activities, and web servers with ease.' },
											{ type: 10, content: '⚡ Fast • 🔌 Pluggable • 🎯 Type-safe' }
										],
										accessory: {
											type: 11, // Thumbnail
											media: { url: 'https://picsum.photos/80/80?random=10' },
											description: 'Robo.js logo'
										}
									}
								]
							}

							try {
								await fetch(`${baseUrl}/dispatch`, {
									method: 'POST',
									headers: { 'Content-Type': 'application/json' },
									body: JSON.stringify({
										event: 'MESSAGE_CREATE',
										data: v2Message2
									})
								})
								sessionDispatch({
									type: 'INJECT_MESSAGES',
									payload: { channelId: selectedChannelId, messages: [v2Message2 as StageMessage] }
								})
								showToast('Section with Thumbnail created', 'success')
							} catch (error) {
								showToast('Failed to create V2 message', 'error')
							}
						}}
					>
						<SectionIcon />
						Section + Thumbnail
					</button>
					<button
						className={styles.actionButton}
						onClick={async () => {
							if (!sessionId || !selectedChannelId) {
								showToast('Select a channel first', 'warning')
								return
							}
							const apiPrefix = getApiPrefix()
							const baseUrl = `${apiPrefix}/api/control/sessions/${sessionId}`

							// Section with Button accessory
							const v2Message3 = {
								id: `v2_${Date.now()}_3`,
								channel_id: selectedChannelId,
								content: '',
								timestamp: new Date().toISOString(),
								author: { id: 'test_bot_001', username: 'Robo', discriminator: '0000', avatar: null, bot: true },
								embeds: [],
								attachments: [],
								flags: 32768,
								components: [
									{
										type: 9, // Section
										components: [
											{ type: 10, content: '### Get Started' },
											{ type: 10, content: 'Click the button to visit our documentation and start building!' }
										],
										accessory: {
											type: 2, // Button
											style: 5, // Link
											label: 'Documentation',
											url: 'https://robojs.dev',
											emoji: { name: '📚' }
										}
									}
								]
							}

							try {
								await fetch(`${baseUrl}/dispatch`, {
									method: 'POST',
									headers: { 'Content-Type': 'application/json' },
									body: JSON.stringify({
										event: 'MESSAGE_CREATE',
										data: v2Message3
									})
								})
								sessionDispatch({
									type: 'INJECT_MESSAGES',
									payload: { channelId: selectedChannelId, messages: [v2Message3 as StageMessage] }
								})
								showToast('Section with Button created', 'success')
							} catch (error) {
								showToast('Failed to create V2 message', 'error')
							}
						}}
					>
						<ButtonIcon />
						Section + Button
					</button>
					<button
						className={styles.actionButton}
						onClick={async () => {
							if (!sessionId || !selectedChannelId) {
								showToast('Select a channel first', 'warning')
								return
							}
							const apiPrefix = getApiPrefix()
							const baseUrl = `${apiPrefix}/api/control/sessions/${sessionId}`

							// MediaGallery message
							const v2Message4 = {
								id: `v2_${Date.now()}_4`,
								channel_id: selectedChannelId,
								content: '',
								timestamp: new Date().toISOString(),
								author: { id: 'test_user_002', username: 'Bob', discriminator: '0002', avatar: null, bot: false },
								embeds: [],
								attachments: [],
								flags: 32768,
								components: [
									{ type: 10, content: '📸 Check out these screenshots from our hackathon!' },
									{
										type: 12, // MediaGallery
										items: [
											{ media: { url: 'https://picsum.photos/300/200?random=20' }, description: 'Team brainstorming' },
											{ media: { url: 'https://picsum.photos/300/200?random=21' }, description: 'Coding session' },
											{ media: { url: 'https://picsum.photos/300/200?random=22' }, description: 'Demo time!' },
											{ media: { url: 'https://picsum.photos/300/200?random=23' }, description: 'Winner announcement', spoiler: true }
										]
									}
								]
							}

							try {
								await fetch(`${baseUrl}/dispatch`, {
									method: 'POST',
									headers: { 'Content-Type': 'application/json' },
									body: JSON.stringify({
										event: 'MESSAGE_CREATE',
										data: v2Message4
									})
								})
								sessionDispatch({
									type: 'INJECT_MESSAGES',
									payload: { channelId: selectedChannelId, messages: [v2Message4 as StageMessage] }
								})
								showToast('MediaGallery message created', 'success')
							} catch (error) {
								showToast('Failed to create V2 message', 'error')
							}
						}}
					>
						<GalleryIcon />
						MediaGallery
					</button>
					<button
						className={styles.actionButton}
						onClick={async () => {
							if (!sessionId || !selectedChannelId) {
								showToast('Select a channel first', 'warning')
								return
							}
							const apiPrefix = getApiPrefix()
							const baseUrl = `${apiPrefix}/api/control/sessions/${sessionId}`

							// Container with accent color
							const v2Message5 = {
								id: `v2_${Date.now()}_5`,
								channel_id: selectedChannelId,
								content: '',
								timestamp: new Date().toISOString(),
								author: { id: 'test_bot_002', username: 'ModBot', discriminator: '0000', avatar: null, bot: true },
								embeds: [],
								attachments: [],
								flags: 32768,
								components: [
									{
										type: 17, // Container
										accent_color: 15158332, // Red
										components: [
											{ type: 10, content: '⚠️ **Warning: Auto-Moderation Alert**' },
											{ type: 14, divider: true, spacing: 'small' },
											{ type: 10, content: 'A message was flagged for potential spam.' },
											{ type: 10, content: '**Action taken:** Warning issued\n**Severity:** Low' },
											{
												type: 1, // ActionRow
												components: [
													{ type: 2, style: 4, label: 'Appeal', custom_id: 'mod_appeal', emoji: { name: '📝' } },
													{ type: 2, style: 2, label: 'Dismiss', custom_id: 'mod_dismiss' }
												]
											}
										]
									}
								]
							}

							try {
								await fetch(`${baseUrl}/dispatch`, {
									method: 'POST',
									headers: { 'Content-Type': 'application/json' },
									body: JSON.stringify({
										event: 'MESSAGE_CREATE',
										data: v2Message5
									})
								})
								sessionDispatch({
									type: 'INJECT_MESSAGES',
									payload: { channelId: selectedChannelId, messages: [v2Message5 as StageMessage] }
								})
								showToast('Container message created', 'success')
							} catch (error) {
								showToast('Failed to create V2 message', 'error')
							}
						}}
					>
						<ContainerIcon />
						Container + Buttons
					</button>
					<button
						className={styles.actionButton}
						onClick={async () => {
							if (!sessionId || !selectedChannelId) {
								showToast('Select a channel first', 'warning')
								return
							}
							const apiPrefix = getApiPrefix()
							const baseUrl = `${apiPrefix}/api/control/sessions/${sessionId}`

							// File component with spoiler
							const v2Message6 = {
								id: `v2_${Date.now()}_6`,
								channel_id: selectedChannelId,
								content: '',
								timestamp: new Date().toISOString(),
								author: { id: 'test_user_001', username: 'Alice', discriminator: '0001', avatar: null, bot: false },
								embeds: [],
								attachments: [],
								flags: 32768,
								components: [
									{ type: 10, content: 'Here are the project files:' },
									{ type: 13, file: { url: 'attachment://project-spec.pdf' } },
									{ type: 13, file: { url: 'attachment://SPOILER_secret-plans.docx' }, spoiler: true }
								]
							}

							try {
								await fetch(`${baseUrl}/dispatch`, {
									method: 'POST',
									headers: { 'Content-Type': 'application/json' },
									body: JSON.stringify({
										event: 'MESSAGE_CREATE',
										data: v2Message6
									})
								})
								sessionDispatch({
									type: 'INJECT_MESSAGES',
									payload: { channelId: selectedChannelId, messages: [v2Message6 as StageMessage] }
								})
								showToast('File component message created', 'success')
							} catch (error) {
								showToast('Failed to create V2 message', 'error')
							}
						}}
					>
						<FileIcon />
						File + Spoiler
					</button>
					<button
						className={styles.actionButton}
						onClick={async () => {
							if (!sessionId || !selectedChannelId) {
								showToast('Select a channel first', 'warning')
								return
							}
							const apiPrefix = getApiPrefix()
							const baseUrl = `${apiPrefix}/api/control/sessions/${sessionId}`

							// Container with spoiler (entire container blurred)
							const v2Message7 = {
								id: `v2_${Date.now()}_7`,
								channel_id: selectedChannelId,
								content: '',
								timestamp: new Date().toISOString(),
								author: { id: 'test_bot_001', username: 'Robo', discriminator: '0000', avatar: null, bot: true },
								embeds: [],
								attachments: [],
								flags: 32768,
								components: [
									{ type: 10, content: '🔒 Click the spoiler container below to reveal:' },
									{
										type: 17, // Container with spoiler
										accent_color: 10181046, // Purple
										spoiler: true,
										components: [
											{ type: 10, content: '### 🎁 Secret Announcement!' },
											{ type: 10, content: 'You found the hidden message! 🎉' },
											{ type: 10, content: '*This is a spoiler container demo*' }
										]
									}
								]
							}

							try {
								await fetch(`${baseUrl}/dispatch`, {
									method: 'POST',
									headers: { 'Content-Type': 'application/json' },
									body: JSON.stringify({
										event: 'MESSAGE_CREATE',
										data: v2Message7
									})
								})
								sessionDispatch({
									type: 'INJECT_MESSAGES',
									payload: { channelId: selectedChannelId, messages: [v2Message7 as StageMessage] }
								})
								showToast('Spoiler Container message created', 'success')
							} catch (error) {
								showToast('Failed to create V2 message', 'error')
							}
						}}
					>
						<SpoilerIcon />
						Spoiler Container
					</button>
				</div>
			</section>

			{/* Toast Testing Section */}
			<section className={styles.section}>
				<h3 className={styles.sectionTitle}>Toast Notifications</h3>
				<p className={styles.description}>
					Test different toast notification types.
				</p>
				<div className={styles.buttonGroup}>
					<button
						className={`${styles.toastButton} ${styles.info}`}
						onClick={() => showToast('This is an info message', 'info')}
					>
						Info
					</button>
					<button
						className={`${styles.toastButton} ${styles.success}`}
						onClick={() => showToast('Operation completed successfully!', 'success')}
					>
						Success
					</button>
					<button
						className={`${styles.toastButton} ${styles.warning}`}
						onClick={() => showToast('Warning: Something needs attention', 'warning')}
					>
						Warning
					</button>
					<button
						className={`${styles.toastButton} ${styles.error}`}
						onClick={() => showToast('Error: Something went wrong!', 'error')}
					>
						Error
					</button>
				</div>
			</section>
		</div>
	)
}

// Icons
function BeakerIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
			<path d="M5 0v1h1v5.2L2 14v1h12v-1l-4-7.8V1h1V0H5zm2 1h2v5.4l3.5 6.6h-9L7 6.4V1z" />
		</svg>
	)
}

function ThinkingIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
			<path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zm0 14A6 6 0 1 1 8 2a6 6 0 0 1 0 12zm.5-9H7v5l4.25 2.5.75-1.23-3.5-2.08V5z" />
		</svg>
	)
}

function ErrorIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
			<path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 12.5a5.5 5.5 0 1 1 0-11 5.5 5.5 0 0 1 0 11zm-.75-8.25h1.5v4.5h-1.5v-4.5zm0 5.5h1.5v1.5h-1.5v-1.5z" />
		</svg>
	)
}

function VoiceIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
			<path d="M12 3a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v8a4 4 0 0 0 8 0V3a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v8a1 1 0 1 1-2 0V3zm-4 8a4 4 0 1 0 8 0V3a1 1 0 0 1 2 0v8a6 6 0 0 1-12 0V3a1 1 0 0 1 2 0v8zm-2 0a6 6 0 0 0 12 0v-1h2v1a8 8 0 0 1-7 7.93V21h3v2H8v-2h3v-2.07A8 8 0 0 1 4 11v-1h2v1z" />
		</svg>
	)
}

function VoiceGroupIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
			<path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
		</svg>
	)
}

function LeaveVoiceIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
			<path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.956.956 0 0 1-.29-.7c0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.1-.7-.28-.79-.73-1.68-1.36-2.66-1.85a1 1 0 0 1-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
		</svg>
	)
}

function SpeakingIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
			<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
		</svg>
	)
}

// Phase 5Q: Components V2 Icons
function ComponentsIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
			<path d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z" />
		</svg>
	)
}

function SectionIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
			<path d="M3 5v14h18V5H3zm16 12H5V7h14v10zM7 9h7v2H7V9zm0 4h10v2H7v-2z" />
		</svg>
	)
}

function ButtonIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
			<path d="M19 7H5c-1.1 0-2 .9-2 2v6c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V9c0-1.1-.9-2-2-2zm0 8H5V9h14v6z" />
		</svg>
	)
}

function GalleryIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
			<path d="M4 8h4V4H4v4zm6 12h4v-4h-4v4zm-6 0h4v-4H4v4zm0-6h4v-4H4v4zm6 0h4v-4h-4v4zm6-10v4h4V4h-4zm-6 4h4V4h-4v4zm6 6h4v-4h-4v4zm0 6h4v-4h-4v4z" />
		</svg>
	)
}

function ContainerIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
			<path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z" />
			<path d="M7 7h2v2H7V7zm0 4h2v2H7v-2zm0 4h2v2H7v-2z" />
		</svg>
	)
}

function FileIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
			<path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z" />
		</svg>
	)
}

function SpoilerIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
			<path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
		</svg>
	)
}

function ShieldIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
			<path d="M5.338 1.59a61.44 61.44 0 0 0-2.837.856.481.481 0 0 0-.328.39c-.554 4.157.726 7.19 2.253 9.188a10.725 10.725 0 0 0 2.287 2.233c.346.244.652.42.893.533.12.057.218.095.293.118a.55.55 0 0 0 .101.025.615.615 0 0 0 .1-.025c.076-.023.174-.061.294-.118.24-.113.547-.29.893-.533a10.726 10.726 0 0 0 2.287-2.233c1.527-1.997 2.807-5.031 2.253-9.188a.48.48 0 0 0-.328-.39c-.651-.213-1.75-.56-2.837-.855C9.552 1.29 8.531 1.067 8 1.067c-.53 0-1.552.223-2.662.524zM5.072.56C6.157.265 7.31 0 8 0s1.843.265 2.928.56c1.11.3 2.229.655 2.887.87a1.54 1.54 0 0 1 1.044 1.262c.596 4.477-.787 7.795-2.465 9.99a11.775 11.775 0 0 1-2.517 2.453 7.159 7.159 0 0 1-1.048.625c-.28.132-.581.24-.877.24s-.596-.108-.877-.24a7.158 7.158 0 0 1-1.048-.625 11.777 11.777 0 0 1-2.517-2.453C1.928 10.487.545 7.169 1.141 2.692A1.54 1.54 0 0 1 2.185 1.43 62.456 62.456 0 0 1 5.072.56z" />
			<path d="M10.854 5.146a.5.5 0 0 1 0 .708l-3 3a.5.5 0 0 1-.708 0l-1.5-1.5a.5.5 0 1 1 .708-.708L7.5 7.793l2.646-2.647a.5.5 0 0 1 .708 0z" />
		</svg>
	)
}

function ClockIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
			<path d="M8 3.5a.5.5 0 0 0-1 0V9a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 8.71V3.5z" />
			<path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0z" />
		</svg>
	)
}

function ToggleCheckIcon() {
	return (
		<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
			<path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 1 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z" />
		</svg>
	)
}

function ToggleOffIcon() {
	return (
		<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
			<path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
		</svg>
	)
}
