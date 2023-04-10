export const CONFIG_FILES = ['.config/robo.mjs', '.config/robo.cjs', 'robo.config.mjs', 'robo.config.cjs']

export const DEFAULT = {
	heartbeat: {
		interval: 5 * 1000
	},
	roboplay: {
		api: 'https://roboplay.dev'
	},
	sage: {
		defer: true,
		ephemeral: false,
		errorReplies: true,
		reply: true
	},
	timeouts: {
		lifecycle: 5 * 1000,
		registerCommands: 3 * 1000
	}
}

// Number of characters to truncate the stack trace to
export const STACK_TRACE_LIMIT = 640

export const TIMEOUT = Symbol('TIMEOUT')
