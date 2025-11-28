# Plugin System

Robo.js plugins are self-contained packages that extend functionality by providing their own commands, events, API routes, and middleware. The plugin system enables "zero-config" integration where installed plugins automatically contribute their handlers to the project.

## Plugin Architecture Overview

```
Plugin Package (e.g., @robojs/analytics)
├── .robo/
│   └── manifest.json          # Plugin's own manifest
├── src/
│   ├── commands/              # Plugin commands
│   ├── events/                # Plugin events (including lifecycle)
│   ├── api/                   # Plugin API routes
│   └── middleware/            # Plugin middleware
├── seed/                      # Files to copy to projects
│   ├── commands/
│   ├── events/
│   └── _root/                 # Files for project root
├── config/
│   └── robo.mjs               # Plugin's own config
└── package.json
```

## Plugin Registration

### Directory-Based Registration

Plugins are registered by creating config files in `/config/plugins/`:

```
/config/plugins/
├── robojs/
│   ├── server.ts              # @robojs/server config
│   └── analytics.ts           # @robojs/analytics config
├── my-plugin.ts               # my-plugin config
└── custom-plugin.mjs          # custom-plugin config
```

### Config File Structure

Plugin config files export plugin options:

```typescript
// /config/plugins/robojs/analytics.ts
export default {
  engine: new GoogleAnalytics(),
  trackCommands: true
}

// /config/plugins/my-plugin.ts
export default {
  apiKey: process.env.MY_PLUGIN_API_KEY,
  enabled: true
}

// Empty config (just registers the plugin)
export default {}
```

### Scoped Plugin Naming

For scoped packages like `@robojs/server`:

- Directory structure: `/config/plugins/robojs/server.ts`
- The `@` is stripped, creating a subdirectory
- Plugin name becomes `@robojs/server`

## Plugin Loading

### Config Scanning

The `loadConfig()` function in `src/core/config.ts` scans for plugin configs:

```typescript
async function loadConfig(file = 'robo', compile = false): Promise<Config> {
  const configPath = await loadConfigPath(file)
  let config = await readConfig<Config>(configPath, compile)
  
  // Load plugin files when using "/config" directory
  if (configPath.includes(path.sep + 'config' + path.sep)) {
    config.plugins = config.plugins ?? []
    
    await scanPlugins(configPath, compile, (plugin, pluginConfig, pluginPath) => {
      // Remove existing plugin config if it exists
      const existingIndex = config.plugins?.findIndex((p) => 
        p === plugin || p[0] === plugin
      )
      if (existingIndex !== -1) {
        config.plugins?.splice(existingIndex, 1)
      }
      
      // Add plugin with its config
      config.plugins?.push([plugin, pluginConfig])
      _configPaths.add(pluginPath)
    })
  }
  
  return config
}
```

### Plugin Scanning

```typescript
async function scanPlugins(configPath, compile, callback) {
  const pluginsPath = path.join(path.dirname(configPath), 'plugins')
  
  if (!fs.existsSync(pluginsPath)) return
  
  const plugins = fs.readdirSync(pluginsPath)
  const pluginData = []
  
  for (const plugin of plugins) {
    const pluginPath = path.join(pluginsPath, plugin)
    
    if (fs.statSync(pluginPath).isDirectory()) {
      // Scoped plugins (e.g., @robojs/server)
      const scopedPlugins = fs.readdirSync(pluginPath)
      for (const scopedPlugin of scopedPlugins) {
        const scopedPath = path.join(pluginPath, scopedPlugin)
        const parts = path.relative(pluginsPath, scopedPath).split('.')
        const pluginName = '@' + parts[0]
        const mode = parts.length > 2 ? parts[1] : undefined
        
        pluginData.push({ mode, name: pluginName, path: scopedPath })
      }
    } else {
      // Non-scoped plugins
      const parts = plugin.split('.')
      const pluginName = parts[0]
      const mode = parts.length > 2 ? parts[1] : undefined
      
      pluginData.push({ mode, name: pluginName, path: pluginPath })
    }
  }
  
  // Load all plugins in parallel
  await Promise.all(pluginData.map(async (plugin) => {
    // Skip if mode doesn't match current mode
    if (plugin.mode && plugin.mode !== Mode.get()) return
    
    const pluginConfig = await readConfig(plugin.path, compile)
    callback(plugin.name, pluginConfig, plugin.path)
  }))
}
```

### Mode-Specific Configs

Plugins can have mode-specific configurations:

```
/config/plugins/
├── my-plugin.ts               # Default config
├── my-plugin.development.ts   # Development mode
└── my-plugin.production.ts    # Production mode
```

## Plugin Data Structure

Plugins are stored in config as tuples:

```typescript
type Plugin = string | [string, unknown, PluginMetaOptions?]

interface PluginData {
  name: string
  options?: unknown        // Plugin-specific options
  metaOptions?: PluginMetaOptions
}

interface PluginMetaOptions {
  failSafe?: boolean       // Continue if plugin fails to start
}
```

### Loading Plugin Data at Runtime

```typescript
function loadPluginData(): Map<string, PluginData> {
  const config = getConfig()
  const collection = new Map<string, PluginData>()
  
  if (!config.plugins) return collection
  
  for (const plugin of config.plugins) {
    if (typeof plugin === 'string') {
      // Simple string registration
      collection.set(plugin, { name: plugin })
    } else if (Array.isArray(plugin)) {
      // Tuple with options
      const [name, options, metaOptions] = plugin
      collection.set(name, { name, options, metaOptions })
    }
  }
  
  return collection
}
```

## Plugin Build Process

When building a plugin with `robo build plugin`:

### Build Command (`src/cli/commands/build/plugin.ts`)

```typescript
async function pluginAction(_args: string[], options: PluginCommandOptions) {
  const config = await loadConfig('robo', true)
  
  // Compile TypeScript to JavaScript
  const compileTime = await Compiler.buildCode({
    excludePaths: config.excludePaths,
    plugin: true                          // Enable plugin mode
  })
  
  // Bundle seed files
  await Compiler.buildSeed()
  
  // Generate manifest with 'plugin' type
  const manifest = await generateManifest(
    { commands: {}, context: {}, events: {} },
    'plugin'                              // Type is 'plugin', not 'robo'
  )
}
```

### Plugin-Specific Build Options

When `plugin: true` is passed to `buildCode`:

```typescript
// In src/cli/compiler/build.ts
if (options?.plugin) {
  // Generate declaration files for plugins
  const declarationTime = Date.now()
  Compiler.buildDeclarationFiles(tsOptions)
  logger.debug(`Generated declaration files in ${Date.now() - declarationTime}ms`)
}
```

## Manifest Merging

When building a Robo project, plugin manifests are merged into the project manifest.

### Reading Plugin Manifests

```typescript
async function readPluginManifest(plugins: Plugin[]): Promise<Manifest> {
  let pluginsManifest = BASE_MANIFEST
  
  for (const plugin of plugins) {
    const pluginName = typeof plugin === 'string' ? plugin : plugin[0]
    const packagePath = await findPackagePath(pluginName, process.cwd())
    
    if (!packagePath) {
      logger.debug(`Plugin ${pluginName} is not installed. Skipping...`)
      continue
    }
    
    // Load the manifest from the plugin package
    const manifest = await Compiler.useManifest({
      basePath: packagePath,
      name: pluginName
    })
    
    // Merge entries
    pluginsManifest = {
      ...pluginsManifest,
      api: { ...pluginsManifest.api, ...manifest.api },
      commands: { ...pluginsManifest.commands, ...manifest.commands },
      context: {
        message: { ...pluginsManifest.context.message, ...manifest.context.message },
        user: { ...pluginsManifest.context.user, ...manifest.context.user }
      },
      events: mergeEvents(pluginsManifest.events, manifest.events),
      middleware: [...pluginsManifest.middleware, ...manifest.middleware],
      permissions: [...pluginsManifest.permissions, ...manifest.permissions],
      scopes: [...pluginsManifest.scopes, ...manifest.scopes]
    }
  }
  
  return pluginsManifest
}
```

### Event Merging

Events from multiple plugins are merged into arrays:

```typescript
const mergeEvents = (
  baseEvents: Record<string, EventConfig[]>,
  newEvents: Record<string, EventConfig[]>
) => {
  const mergedEvents = { ...baseEvents }
  
  for (const eventName in newEvents) {
    const baseEventArray = mergedEvents[eventName] || []
    const newEventArray = newEvents[eventName]
    
    // Concatenate event handlers
    mergedEvents[eventName] = [...baseEventArray, ...newEventArray]
  }
  
  return mergedEvents
}
```

### Plugin Metadata Injection

When loading a plugin manifest, the `__plugin` metadata is injected into all entries:

```typescript
// In useManifest() when loading a plugin
if (name && basePath) {
  const pluginInfo = {
    __auto: true,
    __plugin: { name, path: basePath }
  }
  
  Object.keys(manifest.api ?? {}).forEach((key) => {
    manifest.api[key].__plugin = { name, path: basePath }
    manifest.api[key].__path = manifest.api[key].__path?.replaceAll('\\', path.sep)
  })
  
  Object.keys(manifest.commands).forEach((key) => {
    manifest.commands[key].__plugin = { name, path: basePath }
    manifest.commands[key].__path = manifest.commands[key].__path?.replaceAll('\\', path.sep)
  })
  
  Object.keys(manifest.events).forEach((key) => {
    manifest.events[key] = manifest.events[key].map((eventConfig) => ({
      ...pluginInfo,
      ...eventConfig,
      __path: eventConfig.__path?.replaceAll('\\', path.sep)
    }))
  })
  
  // ... same for context, middleware
}
```

## Seed Files System

Plugins can provide starter files that are copied to projects on installation.

### Seed Directory Structure

```
plugin-package/
├── seed/
│   ├── commands/           # Copied to /src/commands
│   │   └── example.ts
│   ├── events/             # Copied to /src/events
│   │   └── guildCreate.ts
│   ├── middleware/         # Copied to /src/middleware
│   │   └── logger.ts
│   └── _root/              # Copied to project root
│       └── some-config.json
└── .robo/
    └── seed/               # Compiled seed files
```

### Building Seed Files

```typescript
// In src/cli/compiler/seed.ts
async function buildSeed() {
  const SeedDir = path.join(process.cwd(), 'seed')
  const SeedBuildDir = path.join('.robo', 'seed')
  
  // Clear previous seed build
  await rm(SeedBuildDir, { recursive: true, force: true })
  
  if (!existsSync(SeedDir)) {
    return { time: 0 }
  }
  
  // Compile TypeScript files
  const { isTypeScript } = Compiler.isTypescriptProject()
  if (isTypeScript) {
    await Compiler.buildCode({
      distDir: SeedBuildDir,
      srcDir: SeedDir
    })
  }
  
  // Copy remaining files
  await copyDir(SeedDir, SeedBuildDir, [], [])
  
  return { time: Date.now() - startTime }
}
```

### Using Seed Files

When `robo add` installs a plugin, seed files are copied:

```typescript
async function useSeed(packageName: string) {
  const seedPath = path.resolve(packagePath, '.robo', 'seed')
  const projectSrc = path.join(process.cwd(), 'src')
  
  if (existsSync(seedPath)) {
    const manifest = await Compiler.useManifest({
      basePath: path.resolve(seedPath, '..', '..'),
      name: packageName
    })
    
    // Determine which file extensions to exclude
    const identifiesAsTypeScript = manifest.__robo.language === 'typescript'
    const { isTypeScript } = Compiler.isTypescriptProject()
    const excludeExts = identifiesAsTypeScript && isTypeScript 
      ? ['.js', '.jsx'] 
      : ['.ts', '.tsx']
    
    // Copy seed files to project src
    await copyDir(seedPath, projectSrc, excludeExts, excludePaths, false)
    
    // Copy root files
    const rootPath = path.join(seedPath, '_root')
    if (existsSync(rootPath)) {
      await copyDir(rootPath, process.cwd(), excludeExts, [], false)
    }
  }
}
```

## The `robo add` Command

The `robo add` command handles plugin installation:

### Installation Flow

```typescript
async function addAction(packages: string[], options: AddCommandOptions) {
  // 1. Load current config
  const config = await loadConfig('robo', true)
  
  // 2. Check which packages need installation
  const pendingInstall = packages.filter((spec) => {
    if (options.force) return true
    const deps = packageJson.dependencies ?? {}
    const alreadyInDeps = Object.keys(deps).includes(spec)
    const alreadyInConfig = config.plugins?.some((p) => 
      (Array.isArray(p) ? p[0] === spec : p === spec)
    )
    return !(alreadyInDeps || alreadyInConfig)
  })
  
  // 3. Install packages via package manager
  if (pendingInstall.length > 0) {
    const packageManager = getPackageManager()
    const command = packageManager === 'npm' ? 'install' : 'add'
    await exec([packageManager, command, ...pendingInstall])
  }
  
  // 4. Create plugin config files
  await Promise.all(pendingRegistration.map((pkg) => 
    createPluginConfig(pkg, {})
  ))
  
  // 5. Handle seed files (with user consent)
  if (seed && pluginsWithSeeds.length > 0) {
    const seedConsent = options.yes || await promptUser()
    if (seedConsent) {
      await Promise.all(pluginsWithSeeds.map((pkg) => 
        Compiler.useSeed(pkg)
      ))
    }
  }
  
  // 6. Handle environment variables from plugins
  if (envAssignments.length > 0) {
    await applyEnvVariables(envFiles, envAssignments)
  }
}
```

### Creating Plugin Config

```typescript
async function createPluginConfig(pluginName: string, config: Record<string, unknown>) {
  // Split plugin name for scoped packages
  const pluginParts = pluginName.replace(/^@/, '').split('/')
  
  // Create directories
  await fs.mkdir(path.join(process.cwd(), 'config', 'plugins'), { recursive: true })
  
  if (pluginName.startsWith('@')) {
    await fs.mkdir(
      path.join(process.cwd(), 'config', 'plugins', pluginParts[0]),
      { recursive: true }
    )
  }
  
  // Determine file extension
  const { isTypeScript } = Compiler.isTypescriptProject()
  const pluginPath = path.join(
    process.cwd(), 'config', 'plugins', ...pluginParts
  ) + (isTypeScript ? '.ts' : '.mjs')
  
  // Write config file
  const pluginConfig = JSON.stringify(config) + '\n'
  await fs.writeFile(pluginPath, `export default ${pluginConfig}`)
}
```

## Plugin Options Access

Plugins can access their configuration at runtime via `getPluginOptions()`:

```typescript
// In src/core/portal.ts
export function getPluginOptions(packageName: string): unknown | null {
  const config = getConfig()
  const pluginOptions = config?.plugins?.find((plugin) => {
    return (typeof plugin === 'string' ? plugin : plugin[0]) === packageName
  })
  const options = typeof pluginOptions === 'string' ? null : pluginOptions?.[1]
  
  return options ?? null
}
```

### Usage in Plugins

```typescript
// In a plugin's lifecycle handler
import { getPluginOptions } from 'robo.js'

export default async (client, options) => {
  // Options are passed directly to lifecycle handlers
  const { apiKey, enabled } = options
  
  // Or retrieve programmatically
  const pluginOptions = getPluginOptions('@robojs/analytics')
}
```

## Plugin Lifecycle Integration

Plugins receive lifecycle events with their options:

```typescript
// In src/core/robo.ts
async function start(options?: StartOptions) {
  // ... setup ...
  
  // Load plugin data (name -> options mapping)
  const plugins = loadPluginData()
  
  // Notify lifecycle event handlers
  await executeEventHandler(plugins, '_start', client)
  
  // ... continue startup ...
}

// In src/core/handlers.ts
export async function executeEventHandler(
  plugins: Map<string, PluginData> | null,
  eventName: string,
  ...eventData: unknown[]
) {
  const callbacks = portal.events.get(eventName)
  
  await Promise.all(callbacks.map(async (callback) => {
    // Get plugin options for this handler
    const pluginOptions = plugins?.get(callback.plugin?.name)?.options
    
    // Call handler with event data AND plugin options
    await callback.handler.default(
      ...eventData, 
      pluginOptions  // Last argument is plugin options
    )
  }))
}
```

## Key Observations for Decoupling

1. **Plugin registration is file-based** - The `/config/plugins/` directory pattern could be extended to support plugin-defined directories

2. **Manifest merging is straightforward** - Plugins contribute entries that are simply merged into the project manifest

3. **Lifecycle hooks provide extension points** - The `_start`, `_stop`, `_restart` pattern is how plugins initialize themselves

4. **Seed files enable scaffolding** - Plugins can provide starter code that gets copied to projects

5. **Plugin options flow through** - Options configured in `/config/plugins/` are passed to lifecycle handlers

6. **No plugin hooks for build customization** - Currently, plugins cannot modify the build process itself

7. **Directory scanning is centralized** - The core determines which directories to scan, not plugins

8. **Handler types are fixed** - Plugins can only contribute the predefined handler types (commands, events, api, context, middleware)

9. **The `@robojs/server` pattern** - The server plugin demonstrates how functionality currently in core (API routes) could potentially be delegated to plugins

