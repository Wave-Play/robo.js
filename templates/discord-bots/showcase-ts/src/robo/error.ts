import type { ErrorContext } from 'robo.js'

export default function (context: ErrorContext) {
	const err = context.error instanceof Error ? context.error : new Error(String(context.error))
	context.logger.error(`Unhandled error (${context.type}): [${err.name}] ${err.message}`)
}
