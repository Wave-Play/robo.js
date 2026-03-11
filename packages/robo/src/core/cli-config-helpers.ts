/**
 * Configuration helper functions for CLI commands.
 *
 * These helpers provide type-safe ways to create configurations
 * with full TypeScript inference.
 */
import type { CliCommandConfig, SmartCliCommandConfig, TerminalCommandConfig, SmartTerminalCommandConfig } from '../types/cli.js'

/**
 * Creates a CLI command configuration with proper type inference.
 * This is a type-safe identity function that helps TypeScript infer option types.
 *
 * @example
 * ```ts
 * import { createCliCommandConfig, type CliContext } from 'robo.js/cli.js'
 *
 * export const config = createCliCommandConfig({
 *   description: 'Start the development server',
 *   options: [
 *     { alias: '-p', name: '--port', description: 'Port number', type: 'number', default: 3000 },
 *     { alias: '-h', name: '--host', description: 'Host address', type: 'string' },
 *     { alias: '-v', name: '--verbose', description: 'Verbose output', type: 'boolean', required: true }
 *   ]
 * } as const)
 *
 * // TypeScript knows:
 * // - options.port is number (has default)
 * // - options.host is string | undefined (optional)
 * // - options.verbose is boolean (required)
 * export default function myCommand(ctx: CliContext<typeof config>) {
 *   const { port, host, verbose } = ctx.options
 *   // Full type safety!
 * }
 * ```
 *
 * @param config - The CLI command configuration object
 * @returns The same configuration with inferred types
 */
export function createCliCommandConfig<C extends CliCommandConfig>(config: SmartCliCommandConfig<C>): C {
	return config as C
}

/**
 * Creates a terminal command configuration with proper type inference.
 * This is a type-safe identity function that helps TypeScript infer option types.
 *
 * Terminal commands are `/`-prefixed commands in the interactive CLI (robo dev / robo start).
 * Convention: src/robo/terminal/commands/ping.ts → /ping in the interactive terminal.
 *
 * @example
 * ```ts
 * import { createTerminalCommandConfig, type TerminalContext } from 'robo.js'
 *
 * export const config = createTerminalCommandConfig({
 *   description: 'Check if Robo is responding',
 *   options: [
 *     { alias: '-c', name: '--count', description: 'Number of pings', type: 'number', default: 1 }
 *   ]
 * } as const)
 *
 * export default async function (ctx: TerminalContext<typeof config>) {
 *   ctx.write(`pong x${ctx.options.count}!`)
 * }
 * ```
 *
 * @param config - The terminal command configuration object
 * @returns The same configuration with inferred types
 */
export function createTerminalCommandConfig<C extends TerminalCommandConfig>(config: SmartTerminalCommandConfig<C>): C {
	return config as C
}
