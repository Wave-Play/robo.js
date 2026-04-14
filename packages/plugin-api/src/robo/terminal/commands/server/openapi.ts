/**
 * /server openapi - View OpenAPI spec summary.
 *
 * Reads the generated OpenAPI spec from .robo/openapi.json and displays
 * a summary of paths, endpoints, and schemas.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { createTerminalCommandConfig } from 'robo.js'
import type { TerminalContext } from 'robo.js'

export const config = createTerminalCommandConfig({
	description: 'View OpenAPI spec'
} as const)

export default async function (ctx: TerminalContext<typeof config>) {
	const specPath = path.resolve(process.cwd(), '.robo/openapi.json')

	let content: string
	try {
		content = await fs.readFile(specPath, 'utf-8')
	} catch {
		ctx.write('No OpenAPI spec found\n')
		ctx.write('Run `robo build` to generate the OpenAPI spec\n')
		return
	}

	let spec: Record<string, unknown>
	try {
		spec = JSON.parse(content)
	} catch {
		ctx.write('Failed to parse OpenAPI spec\n')
		return
	}

	const info = spec.info as Record<string, string> | undefined
	const paths = spec.paths as Record<string, Record<string, unknown>> | undefined
	const schemas = (spec.components as Record<string, unknown>)?.schemas as Record<string, unknown> | undefined

	const pathCount = paths ? Object.keys(paths).length : 0
	const schemaCount = schemas ? Object.keys(schemas).length : 0

	// Count total endpoints (each method on each path)
	let endpointCount = 0
	if (paths) {
		for (const methods of Object.values(paths)) {
			endpointCount += Object.keys(methods).length
		}
	}

	ctx.write('OpenAPI Spec\n')
	ctx.write('\u2500'.repeat(40) + '\n')
	ctx.write('\n')

	if (info) {
		if (info.title) {
			ctx.write(`  Title      ${info.title}\n`)
		}
		if (info.version) {
			ctx.write(`  Version    ${info.version}\n`)
		}
	}

	ctx.write(`  Paths      ${pathCount}\n`)
	ctx.write(`  Endpoints  ${endpointCount}\n`)
	ctx.write(`  Schemas    ${schemaCount}\n`)
	ctx.write('\n')

	// List paths
	if (paths && pathCount > 0) {
		ctx.write('Paths:\n')
		for (const [pathKey, methods] of Object.entries(paths)) {
			const methodList = Object.keys(methods).map((m) => m.toUpperCase()).join(', ')
			ctx.write(`  ${methodList.padEnd(20)} ${pathKey}\n`)
		}
		ctx.write('\n')
	}
}
