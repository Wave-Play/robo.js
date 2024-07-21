/**
 * Registering process events ensure the "ready" signal is sent to the parent process.
 * Not doing this may cause the process to hang if any setup causes an error.
 * It's just as important to be able to receive messages from the parent process quickly.
 *
 * Note:
 * - Development mode waits for these events to be registered prior to continuing listening for changes.
 * - Imports are done inline to avoid potential crashes due to errors in them.
 */
export function registerProcessEvents() {
	process.on('SIGINT', async () => {
		const { logger } = await import('./logger.js')
		const { Robo } = await import('./robo.js')

		logger.debug('Received SIGINT signal.')
		Robo.stop()
	})

	process.on('SIGTERM', async () => {
		const { logger } = await import('./logger.js')
		const { Robo } = await import('./robo.js')

		logger.debug('Received SIGTERM signal.')
		Robo.stop()
	})

	process.on('unhandledRejection', async (reason) => {
		const { loadConfig } = await import('./config.js')
		const { env } = await import('./env.js')
		const { logger } = await import('./logger.js')
		const { client, Robo } = await import('./robo.js')
		logger.error(reason)

		// Load config file to see if we need handling
		const config = await loadConfig()

		if (config.experimental?.disableBot) {
			return
		}

		// Exit right away if the client isn't ready yet
		// We don't want to send a message to Discord nor notify handlers if we can't
		if (!client?.isReady()) {
			process.exit(1)
		}

		// Log error and ignore it in production
		if (env('nodeEnv') === 'production') {
			return
		}

		// Development mode works a bit differently because we don't want developers to ignore errors
		// Errors will stop the process unless there's a special channel to send them to
		const { sendDebugError } = await import('./debug.js')
		const handledError = await sendDebugError(reason)
		if (!handledError) {
			Robo.stop(1)
		}
	})

	// Tell the parent process we're ready to receive messages
	if (typeof process.send === 'function') {
		process.send?.({ type: 'ready' })
	}

	// Backup message with delay to prevent race conditions
	setTimeout(() => {
		if (typeof process.send === 'function') {
			process.send?.({ type: 'ready', delayed: true })
		}
	}, 1_000)
}
