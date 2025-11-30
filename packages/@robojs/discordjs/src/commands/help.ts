/**
 * Default help command for @robojs/discordjs
 *
 * Displays a list of available commands with pagination and category filtering.
 */
import { getManifest, portal } from 'robo.js'
import {
	ActionRowBuilder,
	AutocompleteInteraction,
	ButtonBuilder,
	ButtonInteraction,
	ButtonStyle,
	ChatInputCommandInteraction,
	Colors,
	EmbedBuilder,
	InteractionReplyOptions,
	MessageFlags,
	Snowflake,
	StringSelectMenuBuilder,
	StringSelectMenuInteraction
} from 'discord.js'
import type { CommandConfig, CommandEntry } from '../types/index.js'

const COMMANDS_PER_PAGE = 20
const NAMESPACE = '__robojs_discordjs_helpmenu'

export const config: CommandConfig = {
	description: 'Displays a list of commands.',
	options: [
		{
			name: 'command',
			description: 'Select a command to view details.',
			type: 'string',
			autocomplete: true,
			required: false
		},
		{
			name: 'category',
			description: 'Filter commands by category.',
			type: 'string',
			required: false,
			autocomplete: true
		}
	]
}

export default async (interaction: ChatInputCommandInteraction) => {
	const manifest = getManifest()
	if (!manifest) {
		return { content: 'Commands not available.' }
	}
	const commands = getInnermostCommands(manifest.commands ?? {})

	const serverId = interaction.guildId
	const filteredByAvailability = commands.filter((cmd) => {
		// Check if command controller exists and is enabled
		try {
			const controller = portal.getController('discord', 'commands', cmd.key)
			if (controller && typeof (controller as { isEnabled?: () => boolean }).isEnabled === 'function') {
				if (!(controller as { isEnabled: () => boolean }).isEnabled()) return false
			}
		} catch {
			// Controller not found, continue
		}

		// Check module enabled state
		if (cmd.command.__module && portal.module(cmd.command.__module)) {
			if (!portal.module(cmd.command.__module).isEnabled()) return false
		}

		// Check server restrictions
		if (serverId) {
			try {
				const controller = portal.getController('discord', 'commands', cmd.key) as {
					isEnabledForServer?: (serverId: string) => boolean
				}
				if (controller?.isEnabledForServer && !controller.isEnabledForServer(serverId)) {
					return false
				}
			} catch {
				// No controller, continue
			}
		}

		return true
	})

	const query = interaction.options.get('command')?.value as string
	const category = interaction.options.get('category')?.value as string
	const queriedCmd = filteredByAvailability.filter((cmd) => cmd.key == query)[0]

	if (queriedCmd) {
		return {
			embeds: [createCommandEmbed(queriedCmd)]
		}
	} else {
		const categorizedCommands = categorizeCommands(filteredByAvailability)
		const categories = Object.keys(categorizedCommands)
		const filteredCommands = category ? categorizedCommands[category] || [] : filteredByAvailability

		const page = 0
		const totalPages = Math.ceil(filteredCommands.length / COMMANDS_PER_PAGE)

		return {
			embeds: [createEmbed(filteredCommands, page, totalPages, category)],
			components: [
				createCategoryMenu(categories, category, interaction.user.id),
				...(totalPages > 1 ? [createPaginationButtons(page, totalPages, category, interaction.user.id)] : [])
			]
		}
	}
}

export const autocomplete = (interaction: AutocompleteInteraction) => {
	const focusedOption = interaction.options.getFocused(true)
	const manifest = getManifest()
	if (!manifest) {
		return []
	}
	const commands = getInnermostCommands(manifest.commands ?? {})
	const serverId = interaction.guildId
	const filteredByAvailability = commands.filter((cmd) => {
		// Check if command controller exists and is enabled
		try {
			const controller = portal.getController('discord', 'commands', cmd.key)
			if (controller && typeof (controller as { isEnabled?: () => boolean }).isEnabled === 'function') {
				if (!(controller as { isEnabled: () => boolean }).isEnabled()) return false
			}
		} catch {
			// Controller not found, continue
		}

		// Check module enabled state
		if (cmd.command.__module && portal.module(cmd.command.__module)) {
			if (!portal.module(cmd.command.__module).isEnabled()) return false
		}

		// Check server restrictions
		if (serverId) {
			try {
				const controller = portal.getController('discord', 'commands', cmd.key) as {
					isEnabledForServer?: (serverId: string) => boolean
				}
				if (controller?.isEnabledForServer && !controller.isEnabledForServer(serverId)) {
					return false
				}
			} catch {
				// No controller, continue
			}
		}

		return true
	})

	if (focusedOption.name === 'category') {
		const query = (focusedOption.value || '').toLowerCase().trim()
		const categories = getCategoryList(filteredByAvailability)

		if (!query) {
			return categories.map((cat) => ({ name: cat, value: cat })).slice(0, 24)
		} else {
			const results = categories.filter((cat) => cat.toLowerCase().includes(query))
			return results.map((cat) => ({ name: cat, value: cat })).slice(0, 24)
		}
	} else {
		const query = ((focusedOption.value as string) ?? '').replace('/', '').toLowerCase().trim()
		if (!query) {
			return filteredByAvailability.map((cmd) => ({ name: `/${cmd.key}`, value: cmd.key })).slice(0, 24)
		} else {
			const results = filteredByAvailability.filter((cmd) => cmd.key.toLowerCase().includes(query))
			return results.map((cmd) => ({ name: `/${cmd.key}`, value: cmd.key })).slice(0, 24)
		}
	}
}

interface CommandWithMeta {
	key: string
	command: CommandEntry & { __module?: string }
	category?: string
}

function getInnermostCommands(
	commands: Record<string, CommandEntry>,
	prefix = '',
	categoryPath = ''
): CommandWithMeta[] {
	let innermostCommands: CommandWithMeta[] = []
	const keys = Object.keys(commands)

	for (const key of keys) {
		if (commands[key].subcommands) {
			const subCommandPrefix = prefix ? `${prefix} ${key}` : key
			const subCategoryPath = categoryPath || key
			const subInnermostCommands = getInnermostCommands(
				commands[key].subcommands as Record<string, CommandEntry>,
				subCommandPrefix,
				subCategoryPath
			)
			innermostCommands = innermostCommands.concat(subInnermostCommands)
		} else {
			const commandPath = prefix ? `${prefix} ${key}` : key
			const pathParts = commandPath.split(' ')
			const category = categoryPath || (pathParts.length > 1 ? pathParts[0] : 'General')
			innermostCommands.push({ key: commandPath, command: commands[key], category })
		}
	}

	return innermostCommands
}

function categorizeCommands(commands: CommandWithMeta[]) {
	const categorized: Record<string, CommandWithMeta[]> = {}

	for (const cmd of commands) {
		const category = cmd.category || 'General'
		if (!categorized[category]) {
			categorized[category] = []
		}
		categorized[category].push(cmd)
	}

	return categorized
}

function getCategoryList(commands: CommandWithMeta[]) {
	const categories = new Set<string>()

	for (const cmd of commands) {
		categories.add(cmd.category || 'General')
	}

	return Array.from(categories).sort()
}

function createCommandEmbed({ key, command }: CommandWithMeta) {
	const poweredBy = process.env.ROBOPLAY_HOST
		? 'Powered by [**RoboPlay** ✨](https://roboplay.dev)'
		: 'Powered by [**Robo.js**](https://robojs.dev)'
	const embed = new EmbedBuilder()
		.setTitle(`/${key}`)
		.setColor(Colors.Blurple)
		.setDescription(`${command.description || 'No description provided.'}\n\n> ${poweredBy}`)

	if (command.options && command.options.length > 0) {
		const optionsDescription = command.options
			.map((option) => {
				const required = option.required ? 'Required' : 'Optional'
				const autocomplete = option.autocomplete ? 'Suggested' : ''
				const choicable = option.choices?.length ? 'Choosable' : ''
				const type = option.type ? `${String(option.type).charAt(0).toUpperCase() + String(option.type).slice(1)}` : ''
				return `**${option.name}**: ${option.description || 'No description'} (${[
					autocomplete || choicable,
					required,
					type
				]
					.join(' ')
					.trim()})`
			})
			.join('\n')

		embed.addFields({ name: '__Options__', value: optionsDescription })
	}

	return embed
}

function createEmbed(commands: CommandWithMeta[], page: number, totalPages: number, category?: string) {
	const poweredBy = process.env.ROBOPLAY_HOST
		? 'Powered by [**RoboPlay** ✨](https://roboplay.dev)'
		: 'Powered by [**Robo.js**](https://robojs.dev)'

	const start = page * COMMANDS_PER_PAGE
	const end = start + COMMANDS_PER_PAGE
	const pageCommands = commands.slice(start, end)

	const title = category ? `Commands: ${category}` : 'Commands'

	return new EmbedBuilder()
		.setTitle(title)
		.setColor(Colors.Blurple)
		.addFields(
			...pageCommands.map(({ key, command }) => ({
				name: `/${key}`,
				value: command.description || 'No description provided.',
				inline: false
			})),
			{ name: '\u200b', value: poweredBy, inline: false }
		)
		.setFooter(
			totalPages > 1
				? {
						text: `Page: ${page + 1} / ${totalPages}`
					}
				: null
		)
}

function createCategoryMenu(categories: string[], selectedCategory: string | undefined, userId: string) {
	return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
		new StringSelectMenuBuilder()
			.setCustomId(`${NAMESPACE}@category@${selectedCategory || 'all'}@${userId}`)
			.setPlaceholder('Select a category')
			.addOptions([
				{
					label: 'All Commands',
					value: 'all',
					default: !selectedCategory
				},
				...categories.map((category) => ({
					label: category,
					value: category,
					default: category === selectedCategory
				}))
			])
	)
}

function createPaginationButtons(page: number, totalPages: number, category: string | undefined, user: Snowflake) {
	return new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId(`${NAMESPACE}@previous@${page}@${user}@${category || 'all'}`)
			.setEmoji('⏪')
			.setStyle(ButtonStyle.Primary)
			.setDisabled(page === 0),
		new ButtonBuilder()
			.setCustomId(`${NAMESPACE}@next@${page}@${user}@${category || 'all'}`)
			.setEmoji('⏭')
			.setStyle(ButtonStyle.Primary)
			.setDisabled(page === totalPages - 1)
	)
}

export async function handleHelpMenuInteraction(interaction: ButtonInteraction | StringSelectMenuInteraction) {
	if (!interaction.isButton() && !interaction.isStringSelectMenu()) {
		return
	}

	// Parse the page number and direction from the custom ID
	const parts = interaction.customId.split('@')
	const prefix = parts[0]
	const action = parts[1]

	// Namespace check
	if (prefix !== NAMESPACE) {
		return
	}

	// Check user
	const userId = parts[3]
	if (userId.toString() !== interaction.user.id.toString()) {
		return await interaction.reply(
			withEphemeralReply(
				{
					content: "This isn't the help menu. Use `/help` to access the list of commands."
				},
				true
			)
		)
	}

	const manifest = getManifest()
	if (!manifest) {
		return
	}
	const commands = getInnermostCommands(manifest.commands ?? {})

	if (interaction.isStringSelectMenu()) {
		const selectedCategory = interaction.values[0]
		const categorizedCommands = categorizeCommands(commands)
		const categories = Object.keys(categorizedCommands)

		const filteredCommands = selectedCategory === 'all' ? commands : categorizedCommands[selectedCategory] || []

		const page = 0
		const totalPages = Math.ceil(filteredCommands.length / COMMANDS_PER_PAGE)

		await interaction.update({
			embeds: [
				createEmbed(filteredCommands, page, totalPages, selectedCategory === 'all' ? undefined : selectedCategory)
			],
			components: [
				createCategoryMenu(categories, selectedCategory === 'all' ? undefined : selectedCategory, interaction.user.id),
				...(totalPages > 1
					? [
							createPaginationButtons(
								page,
								totalPages,
								selectedCategory === 'all' ? undefined : selectedCategory,
								interaction.user.id
							)
						]
					: [])
			]
		})
		return
	}

	if (interaction.isButton()) {
		let page = parseInt(parts[2], 10) || 0
		const category = parts[4] === 'all' ? undefined : parts[4]

		const categorizedCommands = categorizeCommands(commands)
		const categories = Object.keys(categorizedCommands)
		const filteredCommands = category ? categorizedCommands[category] || [] : commands

		const totalPages = Math.ceil(filteredCommands.length / COMMANDS_PER_PAGE)

		// Adjust page based on the button pressed
		if (action === 'previous' && page > 0) {
			page--
		} else if (action === 'next' && page < totalPages - 1) {
			page++
		}

		await interaction.update({
			embeds: [createEmbed(filteredCommands, page, totalPages, category)],
			components: [
				createCategoryMenu(categories, category, interaction.user.id),
				createPaginationButtons(page, totalPages, category, interaction.user.id)
			]
		})
	}
}

const supportsEphemeralFlag = typeof MessageFlags !== 'undefined' && MessageFlags?.Ephemeral != null

export function withEphemeralReply<T extends InteractionReplyOptions>(opts: T, on = true): T {
	if (!on) return opts
	if (supportsEphemeralFlag) opts.flags = MessageFlags.Ephemeral
	else opts.ephemeral = true
	return opts
}
