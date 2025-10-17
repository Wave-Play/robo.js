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

/**
 * Command config for inspecting how many tokens your community has spent talking to the AI.
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

export default async (
	interaction: CommandInteraction,
	options: CommandOptions<typeof config>
): Promise<CommandResult> => {
	if (!interaction.inGuild()) {
		return { content: 'This command can only be used in servers.', ephemeral: true }
	}

	const hasPermission = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
	if (!hasPermission) {
		return {
			content: 'You need the **Manage Server** permission to review AI usage.',
			ephemeral: true
		}
	}

	await interaction.deferReply({ ephemeral: true })

	const window = (options.window as WindowValue | undefined) ?? 'day'
	const limit = clampNumber(options.limit ?? DEFAULT_LIMIT, 1, MAX_LIMIT)
	const model = options.model?.trim() || undefined

	const limits = tokenLedger.getLimits()
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

	return summary.results.map((item) => ({
		name: `${item.model} · ${formatWindowLabel(params.window, item.windowKey)}`,
		value: formatTotals(item.totals)
	}))
}

function formatTotals(totals: { tokensIn: number; tokensOut: number; total: number }): string {
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
