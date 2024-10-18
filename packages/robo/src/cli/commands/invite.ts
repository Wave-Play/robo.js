import { Command } from '../utils/cli-handler.js'
import { logger } from '../../core/logger.js'
import { Manifest } from '../../types/index.js'
import { env } from '../../core/env.js'
import { Compiler } from '../utils/compiler.js'
import { PermissionFlagsBits } from 'discord.js'
import { color, composeColors } from '../../core/color.js'
import { Mode } from '../../core/mode.js'
import { loadEnv } from '../../core/dotenv.js'

const command = new Command('invite')
	.description('Generates a link for servers to add your Robo.')
	.handler(inviteAction)
export default command

async function inviteAction() {
	logger.info(`Generating Robo invite ...`)
	logger.warn(
		`This is experimental and may not generate the correct permissions. If you have issues, use the ${color.bold(
			'Discord Developer Portal'
		)} to generate an invite URL manually.`
	)

	// Set NODE_ENV if not already set
	if (!process.env.NODE_ENV) {
		process.env.NODE_ENV = 'development'
	}

	// Make sure environment variables are loaded
	const defaultMode = Mode.get()
	await loadEnv({ mode: defaultMode })

	// Throw error if no client ID is set
	const clientId = env('discord.clientId')
	if (!clientId) {
		logger.error(`No client ID set. Please set the ${color.bold('DISCORD_CLIENT_ID')} environment variable.`)
		return
	}

	// Compute permissions based on the manifest
	const manifest = await Compiler.useManifest()
	const permissions = getPermissionsFromManifest(manifest)

	// Generate the invite link
	const scope = manifest.scopes.join('%20')
	const inviteLink = `https://discord.com/oauth2/authorize?client_id=${clientId}&scope=${scope}&permissions=${permissions}`

	// Pretty log output
	const boxWidth = inviteLink.length + 4
	const horizontalLine = '═'.repeat(boxWidth)
	const robotLines = ['      ____   ', '     [____]    ', '     ]()()[    ', '   ___\\__/___  ']

	const inviteLabel = "Beep boop, here's your invite link!"
	const maxLineLength = Math.max(inviteLabel.length, boxWidth + 2)
	const padding = ' '.repeat(maxLineLength - robotLines[0].length - 2)

	robotLines.forEach((line) => {
		logger.log(composeColors(color.bold, color.blue)(padding + line))
	})

	logger.log(
		color.green(inviteLabel) +
			padding.slice(0, -inviteLabel.length) +
			composeColors(color.bold, color.blue)('  |__|    |__|  ')
	)
	logger.log(color.green(`╒${horizontalLine}╕`))
	logger.log(color.green(`│${' '.repeat(boxWidth)}│`))
	logger.log(
		color.green(`│  `) + composeColors(color.bold, color.underline, color.blue)(inviteLink) + color.green(`  │`)
	)
	logger.log(color.green(`│${' '.repeat(boxWidth)}│`))
	logger.log(color.green(`╘${horizontalLine}╛\n`))

	// Additional message
	logger.log(`Share your Robo's invite link with server owners. Remember to keep it running.`)
	logger.log(
		`Get free hosting from ${color.bold('RoboPlay')} at ${composeColors(
			color.bold,
			color.underline,
			color.blue
		)('https://roboplay.dev')}\n`
	)
}

function getPermissionsFromManifest(manifest: Manifest) {
	const manifestPermissions = manifest.permissions
	if (!manifestPermissions) {
		logger.warn('No permissions found in manifest... ;-;')
		return BigInt(0)
	}
	if (typeof manifestPermissions === 'number') {
		return BigInt(manifestPermissions)
	}

	// Add required permissions based on the manifest
	let permissions = BigInt(0)
	for (const flag of manifestPermissions) {
		permissions |= PermissionFlagsBits[flag]
	}

	return permissions
}
