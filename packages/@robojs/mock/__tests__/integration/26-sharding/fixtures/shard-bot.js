/**
 * Simple bot script for ShardingManager tests
 *
 * This script is spawned by ShardingManager as a child process.
 * It connects to the mock server and handles IPC messages.
 */
import { Client, GatewayIntentBits } from 'discord.js'

const restUrl = process.env.MOCK_REST_URL || 'http://localhost:3000/api'
console.log('[shard-bot] Starting with REST URL:', restUrl)
console.log('[shard-bot] DISCORD_TOKEN:', process.env.DISCORD_TOKEN ? 'set' : 'not set')
console.log('[shard-bot] SHARDS:', process.env.SHARDS)

const client = new Client({
	intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
	rest: {
		api: restUrl
	}
})

client.once('ready', () => {
	console.log('[shard-bot] Client ready, shard:', client.shard?.ids[0])
	// Signal ready to parent process
	if (process.send) {
		process.send({ type: 'ready', shardId: client.shard?.ids[0] })
	}
})

client.on('error', (error) => {
	console.error('[shard-bot] Client error:', error.message)
})

client.on('debug', (info) => {
	console.log('[shard-bot] Debug:', info)
})

// Handle IPC messages from ShardingManager
process.on('message', (message) => {
	if (message && typeof message === 'object' && 'type' in message) {
		if (message.type === 'ping') {
			process.send?.({ type: 'pong', shardId: client.shard?.ids[0] })
		}
	}
})

// Login with token from environment
const token = process.env.DISCORD_TOKEN
if (token) {
	client.login(token).catch((error) => {
		console.error('Login failed:', error.message)
		process.exit(1)
	})
} else {
	console.error('No DISCORD_TOKEN provided')
	process.exit(1)
}
