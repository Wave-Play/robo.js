import { Command } from 'commander'
import { logger } from '../../core/logger.js'
import { loadManifest } from '../utils/manifest.js'
import chalk from 'chalk'
import { Manifest } from '../../types/index.js'
import { env } from '../../core/env.js'
import { PermissionFlagsBits } from 'discord.js'

const command = new Command('invite').description('Generates a link for servers to add your Robo.').action(inviteAction)
export default command

async function inviteAction() {
	logger.info(`Generating Robo invite ...`)
	logger.warn(
		`This is experimental and may not generate the correct permissions. If you have issues, use the ${chalk.bold(
			'Discord Developer Portal'
		)} to generate an invite URL manually.`
	)

	// Throw error if no client ID is set
	const { clientId } = env.discord
	if (!clientId) {
		logger.error(`No client ID set. Please set the ${chalk.bold('DISCORD_CLIENT_ID')} environment variable.`)
		return
	}

	// Compute permissions based on the manifest
	const manifest = await loadManifest()
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
		logger.log(chalk.bold.blue(padding + line))
	})

	logger.log(chalk.green(inviteLabel) + padding.slice(0, -inviteLabel.length) + chalk.bold.blue('  |__|    |__|  '))
	logger.log(chalk.green(`╒${horizontalLine}╕`))
	logger.log(chalk.green(`│${' '.repeat(boxWidth)}│`))
	logger.log(chalk.green(`│  `) + chalk.bold.underline.blue(inviteLink) + chalk.green(`  │`))
	logger.log(chalk.green(`│${' '.repeat(boxWidth)}│`))
	logger.log(chalk.green(`╘${horizontalLine}╛\n`))

	// Additional message
	logger.log(`Share your Robo's invite link with server owners. Remember to keep it running.`)
	logger.log(
		`Get free hosting from ${chalk.bold('RoboPlay')} at ${chalk.bold.underline.blue('https://roboplay.dev')}\n`
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
