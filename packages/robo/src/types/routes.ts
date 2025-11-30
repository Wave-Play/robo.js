/**
 * Route System Types
 *
 * These types define the plugin-based route system that allows plugins
 * to define their own directory conventions via /src/robo/routes/*.ts
 */

/**
 * Configuration for a route definition.
 * Each route tells Robo.js how to scan a directory and process its files.
 *
 * Note: The directory to scan is inferred from the route filename.
 * /src/robo/routes/commands.ts → scans /src/commands/
 */
export interface RouteConfig {
	/**
	 * Configuration for generating handler keys from file paths.
	 */
	key: KeyConfig

	/**
	 * Configuration for handling nested directories.
	 */
	nesting?: NestingConfig

	/**
	 * Configuration for which exports to capture from handler files.
	 * Enables named exports like GET, POST, etc.
	 */
	exports?: ExportsConfig

	/**
	 * If true, multiple handlers can share the same key.
	 * Used for events where multiple listeners are common.
	 * @default false
	 */
	multiple?: boolean

	/**
	 * Regex pattern to filter files.
	 * Non-matching files are excluded from scanning.
	 * @example /^(?!_)/ excludes files starting with underscore
	 */
	filter?: RegExp

	/**
	 * Human-readable description for documentation.
	 */
	description?: string
}

/**
 * Configuration for key generation from file paths.
 */
export interface KeyConfig {
	/**
	 * Base style for generating keys.
	 * - 'filename': Use only the file name (ping.ts → "ping")
	 * - 'filepath': Use the relative path (admin/ban.ts → "admin{separator}ban")
	 */
	style: 'filename' | 'filepath'

	/**
	 * Separator for filepath style.
	 * @default '/'
	 * @example ' ' produces "admin ban", '.' produces "admin.ban"
	 */
	separator?: string

	/**
	 * How to join nested path segments for key generation.
	 * - 'camelCase': guild/memberAdd → guildMemberAdd
	 * - 'dotNotation': guild/memberAdd → guild.memberAdd
	 * @default Uses separator
	 */
	nested?: 'camelCase' | 'dotNotation'

	/**
	 * Custom transformation function applied after key generation.
	 */
	transform?: (key: string) => string
}

/**
 * Configuration for nested directory handling.
 */
export interface NestingConfig {
	/**
	 * Maximum allowed directory depth.
	 * @example 3 allows /src/commands/a/b/c.ts but not deeper
	 */
	maxDepth?: number

	/**
	 * Whether index.ts files create handlers for their parent directory.
	 * - true: /src/api/users/index.ts → "users"
	 * - false: index.ts files are ignored
	 * @default true
	 */
	allowIndex?: boolean

	/**
	 * Regex pattern for dynamic route segments.
	 * Matched groups become route parameters.
	 * @default /^\[([^\]]+)\]$/ matches [id], [slug], etc.
	 */
	dynamicSegment?: RegExp

	/**
	 * Regex pattern for catch-all route segments.
	 * Matches remaining path segments into an array.
	 * @default /^\[\.\.\.([^\]]+)\]$/ matches [...path], [...slug]
	 * @example /api/auth/[...path].ts matches /api/auth/a/b/c
	 */
	catchAllSegment?: RegExp

	/**
	 * Regex pattern for optional catch-all segments.
	 * Like catch-all but also matches the base path.
	 * @default /^\[\[\.\.\.([^\]]+)\]\]$/ matches [[...slug]]
	 * @example /api/docs/[[...slug]].ts matches /api/docs AND /api/docs/a/b
	 */
	optionalCatchAll?: RegExp
}

/**
 * Configuration for which exports to capture from handler files.
 */
export interface ExportsConfig {
	/**
	 * Named exports to look for (e.g., HTTP methods).
	 * @example ['GET', 'POST', 'PUT', 'DELETE'] for API routes
	 * @example ['autocomplete'] for Discord commands
	 */
	named?: string[]

	/**
	 * Whether the default export is required.
	 * - 'required': File must have default export
	 * - 'optional': Default export is captured if present
	 * - 'forbidden': Default export is ignored/disallowed
	 * @default 'required'
	 */
	default?: 'required' | 'optional' | 'forbidden'

	/**
	 * Whether the config export is required.
	 * @default 'optional'
	 */
	config?: 'required' | 'optional' | 'forbidden'
}

/**
 * Represents a file discovered during directory scanning.
 * Passed to route processor functions.
 */
export interface ScannedEntry {
	/**
	 * Generated key for this handler.
	 * Based on file path and route's KeyConfig.
	 * @example "ping", "admin ban", "users/[id]"
	 */
	key: string

	/**
	 * Full type identifier combining namespace and route name.
	 * @example "discord:commands", "server:api"
	 */
	type: string

	/**
	 * File path relative to /src.
	 * @example "commands/admin/ban.ts"
	 */
	filePath: string

	/**
	 * Relative path within the route directory.
	 * @example "admin/ban.ts" for /src/commands/admin/ban.ts
	 */
	relativePath: string

	/**
	 * All exports from the handler file.
	 * Includes default, config, and any named exports.
	 */
	exports: Record<string, unknown>

	/**
	 * Dynamic segment information extracted from the path.
	 * Only present if the path contains dynamic segments like [id], [...path], [[...slug]].
	 */
	dynamicSegments?: {
		/**
		 * List of dynamic parameter names from [param] segments.
		 * @example ["id", "slug"] for /users/[id]/posts/[slug].ts
		 */
		params: string[]

		/**
		 * Catch-all segment info if present.
		 * @example { param: "path", optional: false } for [...path].ts
		 * @example { param: "slug", optional: true } for [[...slug]].ts
		 */
		catchAll?: {
			param: string
			optional: boolean
		}
	}
}

/**
 * A scanned entry after processing by the route processor.
 * Includes extracted metadata for the manifest.
 */
export interface ProcessedEntry {
	/**
	 * The handler key.
	 * @example "ping", "admin ban", "users/[id]", "auth/[...path]"
	 */
	key: string

	/**
	 * Path to the handler file (for manifest).
	 * @example "commands/admin/ban.js"
	 */
	path: string

	/**
	 * Which exports this handler has.
	 * Used for lazy loading - can check capabilities before importing.
	 */
	exports: {
		/** Whether default export exists */
		default: boolean
		/** Whether config export exists */
		config: boolean
		/** List of named exports found (e.g., ['GET', 'POST']) */
		named: string[]
	}

	/**
	 * Metadata extracted from the handler's config export.
	 * Structure depends on the route type.
	 */
	metadata: Record<string, unknown>

	/**
	 * Additional data for special cases.
	 * @example { parent: 'admin', type: 'subcommand' } for Discord
	 * @example { catchAll: { param: 'path', optional: false } } for Server
	 */
	extra?: Record<string, unknown>

	/**
	 * Module name if from /src/modules/.
	 */
	module?: string

	/**
	 * Whether this entry was auto-generated.
	 */
	auto?: boolean
}

/**
 * Discovered route definition from a plugin or project.
 */
export interface DiscoveredRoute {
	/**
	 * The route name (derived from filename).
	 * @example "commands", "events", "api"
	 */
	name: string

	/**
	 * The directory to scan (inferred from route name).
	 * @example "/src/commands/"
	 */
	directory: string

	/**
	 * Route configuration from the route file's config export.
	 */
	config: RouteConfig

	/**
	 * The route processor function (default export).
	 * Transforms ScannedEntry into ProcessedEntry.
	 */
	processor?: (entry: ScannedEntry) => ProcessedEntry | Promise<ProcessedEntry>

	/**
	 * Controller factory function for creating handler controllers.
	 * Used by Portal in Phase 5 for runtime control.
	 * @example createCommandController from @robojs/discord
	 */
	controller?: (...args: unknown[]) => unknown

	/**
	 * Type information for portal codegen (Phase 5).
	 * Contains Handler and Controller type names from route file exports.
	 */
	typeInfo?: {
		/**
		 * Handler type name exported from the route file.
		 * @example "CommandHandler" from `export type Handler = CommandHandler`
		 */
		handlerType?: string
		/**
		 * Controller type name exported from the route file.
		 * @example "CommandController" from `export type Controller = CommandController`
		 */
		controllerType?: string
	}

	/**
	 * Plugin namespace this route belongs to.
	 * @example "discord", "server"
	 */
	namespace: string

	/**
	 * Path to the route definition file.
	 */
	sourcePath: string
}

/**
 * Aggregated route entries organized by namespace and route name.
 */
export interface RouteEntries {
	/**
	 * Map of namespace -> route name -> processed entries
	 */
	[namespace: string]: {
		[routeName: string]: ProcessedEntry[]
	}
}

/**
 * Route type identifier combining namespace and route name.
 */
export type RouteType = `${string}:${string}`

export default {}
