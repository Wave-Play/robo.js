let _mode = 'production'

interface SetModeOptions {
	cliCommand?: 'dev' | 'start'
}

/**
 * Internal
 */
export function setMode(mode: string, options?: SetModeOptions) {
	const { cliCommand } = options ?? {}
	_mode = mode

	if (!mode && cliCommand === 'dev') {
		_mode = 'development'
	} else if (!mode && cliCommand === 'start') {
		_mode = 'production'
	}
}

export const Mode = Object.freeze({ get })

/**
 * The current mode this Robo instance is running in.
 * This is set by the `--mode` CLI flag.
 * 
 * Defaults to `production` for `robo start` and `development` for `robo dev`.
 */
function get() {
	return _mode
}
