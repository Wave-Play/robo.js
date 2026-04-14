/**
 * Shared handler module type used across all handler files.
 *
 * Represents an imported handler module with a callable default export
 * and optional config export.
 */
export type HandlerModule<TFn, TConfig = unknown> = {
	default?: TFn
	config?: TConfig
	[key: string]: unknown
}
