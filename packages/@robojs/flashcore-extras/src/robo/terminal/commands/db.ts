/**
 * /db - Root help listing for database terminal commands
 */
import { createTerminalCommandConfig } from 'robo.js'
import type { TerminalContext } from 'robo.js'

export const config = createTerminalCommandConfig({
	description: 'Manage Flashcore database schemas and migrations'
} as const)

export default async function (ctx: TerminalContext<typeof config>) {
	ctx.write('\n')
	ctx.write('  Database commands:\n')
	ctx.write('\n')
	ctx.write('  /db backup           Back up .robo/flashcore\n')
	ctx.write('  /db check            Check database integrity\n')
	ctx.write('  /db clear            Clear database\n')
	ctx.write('  /db diff             Show schema changes\n')
	ctx.write('  /db export           Export database\n')
	ctx.write('  /db history          Show schema history\n')
	ctx.write('  /db legacy-migrate   Prepare legacy .robo/data migration\n')
	ctx.write('  /db migrate          Run migrations\n')
	ctx.write('  /db rebuild-indexes  Rebuild indexes\n')
	ctx.write('  /db repair           Repair database\n')
	ctx.write('  /db status           Show database status\n')
	ctx.write('\n')
}
