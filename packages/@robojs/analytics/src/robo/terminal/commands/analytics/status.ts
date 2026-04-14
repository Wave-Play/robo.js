/**
 * /analytics status - Show analytics configuration overview
 */
import { createTerminalCommandConfig } from 'robo.js'
import { Analytics } from '../../../../core/analytics.js'
import type { TerminalContext } from 'robo.js'

export const config = createTerminalCommandConfig({
	description: 'Show analytics configuration'
} as const)

function mask(value: string | undefined): string {
	if (!value) return '(not set)'
	return value.slice(0, 4) + '...'
}

export default async function (ctx: TerminalContext<typeof config>) {
	const ready = Analytics.isReady()
	const info = Analytics.getEngineInfo()

	ctx.write('\n')
	ctx.write('  Analytics Status\n')
	ctx.write('  ────────────────\n')
	ctx.write(`  Ready:    ${ready ? 'Yes' : 'No'}\n`)

	if (info) {
		if (info.type === 'many') {
			ctx.write(`  Engine:   ManyEngines (${info.engines.join(', ')})\n`)
		} else {
			ctx.write(`  Engine:   ${info.name}\n`)
		}
	} else {
		ctx.write('  Engine:   (none)\n')
	}

	ctx.write('\n')
	ctx.write('  Environment Variables\n')
	ctx.write('  ────────────────────\n')
	ctx.write(`  GOOGLE_ANALYTICS_MEASURE_ID:  ${mask(process.env.GOOGLE_ANALYTICS_MEASURE_ID)}\n`)
	ctx.write(`  GOOGLE_ANALYTICS_SECRET:      ${mask(process.env.GOOGLE_ANALYTICS_SECRET)}\n`)
	ctx.write(`  PLAUSIBLE_DOMAIN:             ${mask(process.env.PLAUSIBLE_DOMAIN)}\n`)
	ctx.write('\n')
}
