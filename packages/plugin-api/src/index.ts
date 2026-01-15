export * from './core/types.js'
export { Server } from './core/server.js'
export { RoboRequest } from './core/robo-request.js'
export type { ForTestingOptions } from './core/robo-request.js'
export { RoboResponse } from './core/robo-response.js'
export { define, SCHEMA_SYMBOL } from './core/typed-endpoint.js'
export type { DefinedEndpoint, EndpointSchema, TypedHandler, TypedRoboRequest } from './core/typed-endpoint.js'
export { getServerEngine, ready } from './core/plugin-utils.js'
export { CloudflareProvider } from './core/tunnel/index.js'
export type { TunnelConfig, TunnelProvider, TunnelInstance, TunnelProviderConfig } from './core/tunnel/types.js'

// Plugin route registry for prefix management
export { getPluginRouteRegistry, initPluginRoutes } from './core/plugin-routes.js'
export type { PluginPrefixConfig, PluginPrefixMap, ResolvedPluginRoute } from './core/plugin-routes.js'

// HTTP method exports for named route handlers
export { HTTP_METHODS } from './robo/routes/api.js'
export type { HttpMethodExport, ApiHandler, ApiHandlerModule } from './robo/routes/api.js'

// Port utilities for checking availability and finding available ports
export { isPortAvailable, findAvailablePort, DEFAULT_MAX_PORT_ATTEMPTS } from './core/port-utils.js'
export type { FindAvailablePortOptions, FindAvailablePortResult } from './core/port-utils.js'
