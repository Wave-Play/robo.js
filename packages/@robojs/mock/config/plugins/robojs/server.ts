export default {
	cors: true,
	/**
	 * Plugin-declared URL prefix for @robojs/mock routes.
	 *
	 * When @robojs/mock is used as a plugin, this prefix is PREPENDED to the
	 * base API path (which is `/api` by default). This results in routes at:
	 * - /mock/api/v10/channels/:id/messages - Discord REST API emulation
	 * - /mock/api/control/sessions - Control API for tests
	 *
	 * The plugin prefix is stored in the manifest and applied during route
	 * registration by @robojs/server. The final path is: prefix + baseKey
	 * where baseKey already includes `/api/`, so we only need `/mock` here.
	 */
	prefix: '/mock',
	openapi: true
}
