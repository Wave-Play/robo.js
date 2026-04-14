/**
 * Minimal mock for the 'robo.js' barrel import.
 *
 * Only the `logger` export is used by flashcore-extras source code
 * (via src/core/logger.ts). The full barrel import is too heavy for
 * the Jest environment (uses import.meta etc.), so we provide a
 * lightweight stand-in.
 */

class MockLogger {
	private prefix: string

	constructor(prefix = '') {
		this.prefix = prefix
	}

	fork(name: string): MockLogger {
		return new MockLogger(name)
	}

	info(..._args: unknown[]): void {}
	debug(..._args: unknown[]): void {}
	warn(..._args: unknown[]): void {}
	error(..._args: unknown[]): void {}
	trace(..._args: unknown[]): void {}
}

export const logger = new MockLogger()

// Re-export anything else tests might reference (add as needed)
export const color = {
	bold: (s: string) => s,
	dim: (s: string) => s,
	red: (s: string) => s,
	green: (s: string) => s,
	yellow: (s: string) => s,
	blue: (s: string) => s,
	cyan: (s: string) => s,
	white: (s: string) => s
}

export function createTerminalCommandConfig(config: any): any {
	return config
}
