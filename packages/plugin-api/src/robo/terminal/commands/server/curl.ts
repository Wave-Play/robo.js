/**
 * /server curl - Test API routes.
 *
 * Simple HTTP client for testing local server routes from the terminal.
 * Usage: /server curl [method] <path>
 */
import { createTerminalCommandConfig } from 'robo.js'
import type { TerminalContext } from 'robo.js'

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']

export const config = createTerminalCommandConfig({
	description: 'Test API routes',
	positionalArgs: true,
	options: [
		{
			alias: '-b',
			name: '--body',
			description: 'Request body (JSON string)',
			type: 'string',
			default: ''
		},
		{
			alias: '-H',
			name: '--header',
			description: 'Request header (Key: Value)',
			type: 'string',
			default: ''
		}
	]
} as const)

export default async function (ctx: TerminalContext<typeof config>) {
	const { body, header } = ctx.options
	const args = ctx.args

	if (args.length === 0) {
		ctx.write('Usage: /server curl [method] <path>\n')
		ctx.write('\n')
		ctx.write('Examples:\n')
		ctx.write('  /server curl /api/hello\n')
		ctx.write('  /server curl POST /api/users --body \'{"name":"test"}\'\n')
		ctx.write('  /server curl GET /api/health --header "Authorization: Bearer token"\n')
		return
	}

	// Parse method and path from positional args
	let method = 'GET'
	let routePath: string

	if (args.length >= 2 && METHODS.includes(args[0].toUpperCase())) {
		method = args[0].toUpperCase()
		routePath = args[1]
	} else {
		routePath = args[0]
	}

	// Ensure path starts with /
	if (!routePath.startsWith('/')) {
		routePath = '/' + routePath
	}

	const server = globalThis.roboServer
	const port = server?.port ?? 3000
	const hostname = server?.hostname ?? 'localhost'
	const url = `http://${hostname}:${port}${routePath}`

	// Build headers
	const headers: Record<string, string> = {}
	if (header) {
		const colonIndex = header.indexOf(':')
		if (colonIndex > 0) {
			const key = header.substring(0, colonIndex).trim()
			const value = header.substring(colonIndex + 1).trim()
			headers[key] = value
		}
	}

	// Build fetch options
	const fetchOptions: RequestInit = { method, headers }
	if (body && method !== 'GET' && method !== 'HEAD') {
		fetchOptions.body = body
		if (!headers['Content-Type']) {
			headers['Content-Type'] = 'application/json'
		}
	}

	ctx.write(`${method} ${url}\n`)
	ctx.write('\n')

	try {
		const response = await fetch(url, fetchOptions)

		ctx.write(`Status: ${response.status} ${response.statusText}\n`)
		ctx.write('\n')

		// Show select response headers
		const showHeaders = ['content-type', 'content-length', 'cache-control', 'set-cookie', 'location']
		for (const [key, value] of Array.from(response.headers as any) as [string, string][]) {
			if (showHeaders.includes(key.toLowerCase())) {
				ctx.write(`  ${key}: ${value}\n`)
			}
		}
		ctx.write('\n')

		// Show response body
		const text = await response.text()
		if (text) {
			// Try to pretty-print JSON
			try {
				const json = JSON.parse(text)
				ctx.write(JSON.stringify(json, null, 2) + '\n')
			} catch {
				ctx.write(text + '\n')
			}
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		ctx.write(`Error: ${message}\n`)
	}
}
