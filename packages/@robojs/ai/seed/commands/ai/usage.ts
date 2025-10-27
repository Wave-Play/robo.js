import { AI, tokenLedger } from '@robojs/ai'
import { CommandInteraction, EmbedBuilder, PermissionFlagsBits } from 'discord.js'
import { createCommandConfig, type CommandOptions, type CommandResult } from 'robo.js'

const WINDOW_CHOICES = [
	{ name: 'Daily totals', value: 'day' },
	{ name: 'Weekly totals', value: 'week' },
	{ name: 'Monthly totals', value: 'month' },
	{ name: 'Lifetime totals', value: 'lifetime' }
] as const

type WindowValue = (typeof WINDOW_CHOICES)[number]['value']

const TOKEN_FORMAT = new Intl.NumberFormat('en-US')
const DEFAULT_LIMIT = 5
const MAX_LIMIT = 20

/*
	AI Usage Command

	This command displays AI token usage statistics for server administrators.
	Options:
	- window: choose how to group usage (day, week, month, lifetime)
	- model: filter results by model identifier
	- limit: number of entries to show (1-20)

	Requires Manage Server permission and is restricted to servers. You can adjust
	permissions, add filters, or restyle the embed to fit your community.

	Learn more:
	- Commands guide: https://robojs.dev/discord-bots/commands
	- AI plugin docs: https://robojs.dev/plugins/ai
*/
export const config = createCommandConfig({
	defaultMemberPermissions: String(PermissionFlagsBits.ManageGuild),
	description: 'Inspect AI token usage and enforce spend discipline.',
	dmPermission: false,
	options: [
		{
			name: 'window',
			description: 'Grouping window to inspect',
			required: false,
			type: 'string',
			choices: WINDOW_CHOICES
		},
		{
			name: 'model',
			description: 'Filter results to a specific model identifier',
			required: false,
			type: 'string'
		},
		{
			name: 'limit',
			description: 'How many rows to include (1-20)',
			required: false,
			type: 'integer',
			min: 1,
			max: 20
		}
	]
} as const)

/**
 * Retrieves token usage from the AI plugin's ledger, formats an embed with
 * totals per model/time window, and displays any configured token limits.
 * Reply is ephemeral to keep usage data private.
 */
export default async (
	interaction: CommandInteraction,
	options: CommandOptions<typeof config>
): Promise<CommandResult> => {
	if (!interaction.inGuild()) {
		return { content: 'This command can only be used in servers.', ephemeral: true }
	}

	// Double-check Manage Server permission at runtime for security.
	const hasPermission = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
	if (!hasPermission) {
		return {
			content: 'You need the **Manage Server** permission to review AI usage.',
			ephemeral: true
		}
	}

	// Defer ephemerally: fetching and aggregating usage data may take time and should remain private.
	await interaction.deferReply({ ephemeral: true })

	const window = (options.window as WindowValue | undefined) ?? 'day'
	const limit = clampNumber(options.limit ?? DEFAULT_LIMIT, 1, MAX_LIMIT)
	const model = options.model?.trim() || undefined

	const limits = tokenLedger.getLimits()
	// Aggregate token usage data based on selected window and optional model filter.
	const fields = await buildUsageFields({ window, limit, model })

	if (!fields.length) {
		return { content: 'No usage data found for the selected filters.' }
	}

	const embed = new EmbedBuilder()
		.setTitle('AI Token Usage')
		.setDescription(buildSummaryDescription(window, model, limit, limits))
		.addFields(fields)
		.setColor(0x5865f2)
		.setTimestamp(new Date())

	return { embeds: [embed] }
}

async function buildUsageFields(params: { window: WindowValue; limit: number; model?: string }) {
	if (params.window === 'lifetime') {
		// Lifetime totals aggregate all usage across all time periods without windowing.
		const lifetimeTotals = await AI.getLifetimeUsage(params.model)
		const entries = Object.entries(lifetimeTotals)
		if (!entries.length) {
			return []
		}
		return entries
			.sort(([, a], [, b]) => b.total - a.total)
			.slice(0, params.limit)
			.map(([model, totals]) => ({
				name: model,
				value: formatTotals(totals)
			}))
	}

	const summary = await AI.getUsageSummary({
		model: params.model,
		window: params.window,
		limit: params.limit
	})

	if (!summary.results.length) {
		return []
	}

	// Windowed summaries group usage by day/week/month for trend analysis.
	return summary.results.map((item) => ({
		name: `${item.model} · ${formatWindowLabel(params.window, item.windowKey)}`,
		value: formatTotals(item.totals)
	}))
}

function formatTotals(totals: { tokensIn: number; tokensOut: number; total: number }): string {
	// Format numbers with thousands separators and split into prompt (input) and completion (output) tokens.
	const total = TOKEN_FORMAT.format(totals.total)
	const inTokens = TOKEN_FORMAT.format(totals.tokensIn)
	const outTokens = TOKEN_FORMAT.format(totals.tokensOut)
	return `Total: **${total}** tokens\nPrompt: ${inTokens} \u2022 Completion: ${outTokens}`
}

function formatWindowLabel(window: WindowValue, key: string): string {
	if (window === 'day') {
		const date = new Date(`${key}T00:00:00Z`)
		return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
	}
	if (window === 'month') {
		const [year, month] = key.split('-')
		if (year && month) {
			return `${new Date(Date.UTC(Number(year), Number(month) - 1)).toLocaleDateString(undefined, {
				month: 'long',
				year: 'numeric'
			})}`
		}
	}
	if (window === 'week') {
		return `Week ${key}`
	}
	return key
}

function buildSummaryDescription(
	window: WindowValue,
	model: string | undefined,
	limit: number,
	limits: ReturnType<typeof tokenLedger.getLimits>
): string {
	// Build the embed description with current filters and any configured token limits for context.
	const parts: string[] = []
	const label = WINDOW_CHOICES.find((choice) => choice.value === window)?.name ?? 'Usage'
	parts.push(`Window: **${label}**`)
	parts.push(`Entries: **${limit}**`)
	if (model) {
		parts.push(`Model filter: **${model}**`)
	} else {
		parts.push('Model filter: _All_')
	}
	const perModelLimits = limits.perModel ?? {}
	const limitLines = Object.entries(perModelLimits).map(
		([modelName, config]) => `• ${modelName}: ${config.maxTokens.toLocaleString()} tokens per ${config.window}`
	)
	if (limitLines.length) {
		parts.push(`Limits:\n${limitLines.join('\n')}`)
	}
	return parts.join('\n')
}

function clampNumber(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max)
}
