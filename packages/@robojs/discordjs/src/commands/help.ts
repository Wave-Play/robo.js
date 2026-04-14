/**
 * Default help command for @robojs/discordjs
 *
 * Displays a list of available commands with pagination and category filtering.
 */
import { Manifest, portal } from 'robo.js'
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
import type { CommandConfig, CommandOption } from '../types/index.js'
import type { HandlerEntry } from 'robo.js'
import { getPluginConfig } from '../core/client.js'

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
	const commandEntries = await loadCommandEntries()
	if (!commandEntries) {
		return { content: 'Commands not available.' }
	}

	const prefixEntries = await loadPrefixCommandEntries()
	const commands = [
		...getCommandsWithMeta(commandEntries),
		...getPrefixCommandsWithMeta(prefixEntries ?? [])
	]

	const serverId = interaction.guildId
	const filteredByAvailability = filterByAvailability(commands, serverId)

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

export const autocomplete = async (interaction: AutocompleteInteraction) => {
	const focusedOption = interaction.options.getFocused(true)
	const commandEntries = await loadCommandEntries()
	if (!commandEntries) {
		return []
	}

	const prefixEntries = await loadPrefixCommandEntries()
	const commands = [
		...getCommandsWithMeta(commandEntries),
		...getPrefixCommandsWithMeta(prefixEntries ?? [])
	]
	const serverId = interaction.guildId
	const filteredByAvailability = filterByAvailability(commands, serverId)

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
		const query = ((focusedOption.value as string) ?? '').replace(/^[/!]/, '').toLowerCase().trim()
		if (!query) {
			return filteredByAvailability.map((cmd) => ({ name: `${getCommandPrefix(cmd)}${cmd.key}`, value: cmd.key })).slice(0, 24)
		} else {
			const results = filteredByAvailability.filter((cmd) => {
				if (cmd.key.toLowerCase().includes(query)) return true
				// Also match aliases for prefix commands
				if (cmd.type === 'prefix' && cmd.aliases?.some((a) => a.toLowerCase().includes(query))) return true
				return false
			})
			return results.map((cmd) => ({ name: `${getCommandPrefix(cmd)}${cmd.key}`, value: cmd.key })).slice(0, 24)
		}
	}
}

interface CommandWithMeta {
	key: string
	description?: string
	options?: CommandOption[]
	module?: string
	category?: string
	type?: 'slash' | 'prefix'
	aliases?: string[]
}

/**
 * Convert HandlerEntry[] to CommandWithMeta[] for display.
 * The new manifest uses flat keys like "admin ban" instead of nested subcommands.
 */
function getCommandsWithMeta(entries: HandlerEntry[]): CommandWithMeta[] {
	return entries.map((entry) => {
		// Determine category from the key path
		const pathParts = entry.key.split(' ')
		const category = pathParts.length > 1 ? pathParts[0] : 'General'

		return {
			key: entry.key,
			description: entry.metadata?.description as string | undefined,
			options: entry.metadata?.options as CommandOption[] | undefined,
			module: entry.module,
			category,
			type: 'slash' as const
		}
	})
}

/**
 * Convert prefix command HandlerEntry[] to CommandWithMeta[] for display.
 */
function getPrefixCommandsWithMeta(entries: HandlerEntry[]): CommandWithMeta[] {
	return entries.map((entry) => {
		const pathParts = entry.key.split(' ')
		const category = pathParts.length > 1 ? pathParts[0] : 'General'

		return {
			key: entry.key,
			description: entry.metadata?.description as string | undefined,
			module: entry.module,
			category,
			type: 'prefix' as const,
			aliases: entry.metadata?.aliases as string[] | undefined
		}
	})
}

/**
 * Filter commands by availability (enabled, module, server restrictions).
 */
function filterByAvailability(commands: CommandWithMeta[], serverId: string | null): CommandWithMeta[] {
	return commands.filter((cmd) => {
		// Determine the correct route for controller lookup
		const route = cmd.type === 'prefix' ? 'prefixCommands' : 'commands'

		// Check if command controller exists and is enabled
		try {
			const controller = portal.getController('discordjs', route, cmd.key)
			if (controller && typeof (controller as { isEnabled?: () => boolean }).isEnabled === 'function') {
				if (!(controller as { isEnabled: () => boolean }).isEnabled()) return false
			}
		} catch {
			// Controller not found, continue
		}

		// Check module enabled state
		if (cmd.module && portal.module(cmd.module)) {
			if (!portal.module(cmd.module).isEnabled()) return false
		}

		// Check server restrictions
		if (serverId) {
			try {
				const controller = portal.getController('discordjs', route, cmd.key) as {
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

function getCommandPrefix(cmd: CommandWithMeta): string {
	if (cmd.type === 'prefix') {
		const config = getPluginConfig()
		const prefixValue = config?.prefix?.value
		return typeof prefixValue === 'string' ? prefixValue : '!'
	}
	return '/'
}

function createCommandEmbed(cmd: CommandWithMeta) {
	const poweredBy = process.env.ROBOPLAY_HOST
		? 'Powered by [**RoboPlay** ✨](https://roboplay.dev)'
		: 'Powered by [**Robo.js**](https://robojs.dev)'
	const prefix = getCommandPrefix(cmd)
	let description = cmd.description || 'No description provided.'

	// Show aliases for prefix commands
	if (cmd.type === 'prefix' && cmd.aliases?.length) {
		description += `\n\n**Aliases:** ${cmd.aliases.map((a) => `\`${prefix}${a}\``).join(', ')}`
	}

	const embed = new EmbedBuilder()
		.setTitle(`${prefix}${cmd.key}`)
		.setColor(Colors.Blurple)
		.setDescription(`${description}\n\n> ${poweredBy}`)

	if (cmd.options && cmd.options.length > 0) {
		const optionsDescription = cmd.options
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
			...pageCommands.map((cmd) => ({
				name: `${getCommandPrefix(cmd)}${cmd.key}`,
				value: cmd.description || 'No description provided.',
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
		const visibleCategories =
			selectedCategory && !categories.slice(0, 24).includes(selectedCategory)
				? [selectedCategory, ...categories.filter((category) => category !== selectedCategory).slice(0, 23)]
				: categories.slice(0, 24)

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
					...visibleCategories.map((category) => ({
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

	const commandEntries = await loadCommandEntries()
	if (!commandEntries) {
		return
	}
	const prefixEntries = await loadPrefixCommandEntries()
	const allCommands = [
		...getCommandsWithMeta(commandEntries),
		...getPrefixCommandsWithMeta(prefixEntries ?? [])
	]
	const commands = filterByAvailability(allCommands, interaction.guildId)

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

async function loadCommandEntries(): Promise<HandlerEntry[] | null> {
	try {
		await portal.ensureRoute('discordjs', 'commands')
		return Manifest.routesSync('discordjs', 'commands')
	} catch {
		return null
	}
}

async function loadPrefixCommandEntries(): Promise<HandlerEntry[] | null> {
	try {
		await portal.ensureRoute('discordjs', 'prefixCommands')
		return Manifest.routesSync('discordjs', 'prefixCommands')
	} catch {
		return null
	}
}

const supportsEphemeralFlag = typeof MessageFlags !== 'undefined' && MessageFlags?.Ephemeral != null

export function withEphemeralReply<T extends InteractionReplyOptions>(opts: T, on = true): T {
	if (!on) return opts
	if (supportsEphemeralFlag) opts.flags = MessageFlags.Ephemeral
	else opts.ephemeral = true
	return opts
}
