import { patchLogger } from '../core/loggers.js'

export const DiscordEntryPointCommand = { patch }

/**
 * Fixes the Entry Command in your Discord App.
 *
 * Replace `<DISCORD_CLIENT_ID>` and `<DISCORD_TOKEN>` with the actual values in your [Discord Developer Portal](https://discord.com/developers/applications/).
 */
async function patch() {
	// Get the client ID and token from arguments or hard-coded values above.
	const clientId = process.env.DISCORD_CLIENT_ID
	const token = process.env.DISCORD_TOKEN

	if (!clientId || !token) {
		throw '`DISCORD_CLIENT_ID` and `DISCORD_TOKEN` environment variables are required.'
	}

	// Get the existing commands.
	const commandsResponse = await request('/commands', { clientId, token })
	const commands = await commandsResponse.json()
	patchLogger.debug('Checking existing commands:', commands)

	if (!commandsResponse.ok) {
		throw 'Error fetching commands. ' + commands.message
	}

	// See if an entry command already exists.
	let entryCommand = commands.find((command: { type: number }) => command.type === 4)

	if (entryCommand) {
		patchLogger.debug('Entry command already exists. No need to fix.', entryCommand)
		return
	}

	// Create the entry command if it doesn't exist.
	const body = {
		name: 'launch',
		description: 'Launch an activity',
		contexts: [0, 1, 2],
		integration_types: [0, 1],
		type: 4,
		handler: 2
	}
	const commandResponse = await request.post('/commands', { body, clientId, token })
	entryCommand = await commandResponse.json()
	patchLogger.debug('Created command response:', entryCommand)

	if (entryCommand.errors) {
		throw 'Error creating entry command.'
	}

	patchLogger.ready('Successfully registered missing entry point command.')
}

interface RequestOptions {
	body?: Record<string, unknown>
	clientId: string
	method?: 'GET' | 'POST' | 'PUT'
	token: string
}

function request(path: string, options: RequestOptions) {
	const { body, clientId, method = 'GET', token } = options
	const headers: Record<string, string> = {
		Authorization: 'Bot ' + token
	}

	if (['POST', 'PUT'].includes(method)) {
		headers['Content-Type'] = 'application/json'
	}

	return fetch('https://discord.com/api/v10/applications/' + clientId + path, {
		body: body ? JSON.stringify(body) : undefined,
		headers: headers,
		method: method
	})
}
request.post = (path: string, options: RequestOptions) => request(path, { ...options, method: 'POST' })
