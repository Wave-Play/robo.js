# Build Process

The Robo.js build process transforms TypeScript source files into executable JavaScript, generates the manifest, and optionally registers commands with Discord. This document covers the complete build pipeline.

## Build Command Overview

### CLI Entry Point

From `src/cli/commands/build/index.ts`:

```typescript
const command = new Command('build')
  .description('Builds your bot for production.')
  .option('-d', '--dev', 'build for development')
  .option('-f', '--force', 'force register commands')
  .option('-nr', '--no-register', 'skip automatic command registration')
  .option('-m', '--mode', 'specify the mode(s) to run in')
  .option('-s', '--silent', 'do not print anything')
  .option('-v', '--verbose', 'print more information for debugging')
  .handler(buildAction)
  .addCommand(plugin)  // robo build plugin
```

### Build Action Flow

```typescript
async function buildAction(files: string[], options: BuildCommandOptions) {
  // 1. Setup logging
  logger.info(`Building Robo...`)
  
  // 2. Set environment
  process.env.NODE_ENV = options.dev ? 'development' : 'production'
  await Env.load({ mode: envMode })
  
  // 3. Load configuration
  const config = await loadConfig('robo', true)
  
  // 4. Initialize Flashcore (for error persistence)
  await Flashcore.$init({ keyvOptions: config.flashcore?.keyv })
  
  // 5. Compile TypeScript
  const compileTime = await Compiler.buildCode({
    distDir: config.experimental?.buildDirectory,
    excludePaths: config.excludePaths,
    files: files  // For incremental builds
  })
  
  // 6. Generate default handlers
  const generatedFiles = await generateDefaults(config.experimental?.buildDirectory)
  
  // 7. Generate manifest
  const oldManifest = await Compiler.useManifest({ safe: true })
  const manifest = await generateManifest(generatedFiles, 'robo')
  
  // 8. Build public directory (production only)
  if (!options.dev) {
    await buildPublicDirectory()
  }
  
  // 9. Compare and register commands (if changes detected)
  const addedCommands = findCommandDifferences(oldCommands, newCommands, 'added')
  const removedCommands = findCommandDifferences(oldCommands, newCommands, 'removed')
  const changedCommands = findCommandDifferences(oldCommands, newCommands, 'changed')
  
  if (shouldRegister) {
    await registerCommands(...)
  }
  
  // 10. Print summary and exit
  printBuildSummary(manifest, totalSize, startTime, false)
  process.exit(0)
}
```

## Compilation Pipeline

### The Compiler Facade

From `src/cli/utils/compiler.ts`:

```typescript
export const Compiler = {
  buildCode,           // TypeScript compilation
  buildDeclarationFiles,  // .d.ts generation for plugins
  buildSeed,           // Plugin seed file compilation
  getManifest,         // Get cached manifest
  hasSeed,             // Check if plugin has seed files
  isTypescriptProject, // Detect TypeScript project
  useManifest,         // Load manifest
  useSeed              // Copy seed files to project
}
```

### TypeScript Compilation

From `src/cli/compiler/build.ts`:

```typescript
interface BuildCodeOptions {
  baseUrl?: string
  clean?: boolean           // Clean dist before build
  copyOther?: boolean       // Copy non-TS files
  distDir?: string          // Output directory
  distExt?: string          // Output extension (.js)
  excludePaths?: string[]   // Paths to exclude
  files?: string[]          // Specific files (incremental)
  parallel?: number         // Concurrent file limit
  paths?: Record<string, string[]>  // Path mappings
  plugin?: boolean          // Plugin build mode
  srcDir?: string           // Source directory
}

async function buildCode(options?: BuildCodeOptions) {
  const { clean = true, copyOther = true, srcDir = SrcDir } = options ?? {}
  const distDir = options.distDir ?? path.join('.robo', 'build')
  
  // Check if TypeScript project
  const { isTypeScript, missing } = Compiler.isTypescriptProject()
  if (!isTypeScript) {
    // Just copy source files
    await copyDir(srcDir, distDir, [], options.excludePaths ?? [])
    return Date.now() - startTime
  }
  
  // Clean output directory
  if (clean && !options?.files?.length) {
    await fs.rm(distDir, { recursive: true, force: true })
  }
  
  // Get TypeScript compiler options
  const tsOptions = await getTypeScriptCompilerOptions()
  
  // Traverse and compile with SWC
  await traverse(srcDir, distDir, compileOptions, tsOptions, transform)
  
  // Clean up .swc cache
  await fs.rm(path.join(process.cwd(), '.swc'), { recursive: true, force: true })
  
  // Copy non-TypeScript files
  if (copyOther) {
    await copyDir(srcDir, distDir, ['.ts', '.tsx'], options.excludePaths ?? [])
  }
  
  // Generate declaration files for plugins
  if (options?.plugin) {
    Compiler.buildDeclarationFiles(tsOptions)
  }
  
  return Date.now() - startTime
}
```

### SWC Transformation

```typescript
async function traverse(dir, distDir, options, compilerOptions, transform) {
  const { distExt = '.js', parallel = 20, srcDir = SrcDir } = options
  
  const files = await fs.readdir(dir)
  const tasks = []
  
  for (const file of files) {
    const filePath = path.join(dir, file)
    const stat = await fs.stat(filePath)
    
    if (stat.isDirectory()) {
      tasks.push(traverse(filePath, distDir, options, compilerOptions, transform))
    } else if (/\.(js|ts|tsx)$/.test(file)) {
      tasks.push((async () => {
        const fileContents = await fs.readFile(filePath, 'utf-8')
        
        // SWC transform options
        const compileResult = await transform(fileContents, {
          filename: filePath,
          module: {
            type: 'es6',
            strict: false,
            strictMode: true,
            resolveFully: true  // Important for Linux imports
          },
          sourceMaps: env.get('nodeEnv') === 'production' ? false : 'inline',
          jsc: {
            target: 'esnext',
            baseUrl: options.baseUrl,
            paths: options.paths,
            parser: {
              syntax: 'typescript',
              tsx: filePath.endsWith('.tsx'),
              dynamicImport: true,
              decorators: compilerOptions.experimentalDecorators ?? true
            },
            transform: {
              legacyDecorator: compilerOptions.experimentalDecorators ?? true,
              useDefineForClassFields: compilerOptions.useDefineForClassFields ?? false
            }
          }
        })
        
        // Write compiled file
        const distPath = path.join(distDir, path.relative(srcDir, filePath.replace(/\.(ts|tsx)$/, distExt)))
        await fs.mkdir(path.dirname(distPath), { recursive: true })
        await fs.writeFile(distPath, compileResult.code)
      })())
    }
    
    // Limit parallel operations
    if (tasks.length >= parallel) {
      await Promise.all(tasks)
      tasks.length = 0
    }
  }
  
  await Promise.all(tasks)
}
```

## TypeScript Detection

```typescript
function isTypescriptProject(): { isTypeScript: boolean; missing: string[] } {
  const tsconfigPath = path.join(process.cwd(), 'tsconfig.json')
  const missing: string[] = []
  
  // Check for tsconfig.json
  if (!existsSync(tsconfigPath)) {
    missing.push('tsconfig.json')
  }
  
  // Check for TypeScript files
  const srcDir = path.join(process.cwd(), 'src')
  const hasTypeScriptFiles = existsSync(srcDir) && 
    fs.readdirSync(srcDir, { recursive: true })
      .some(file => file.endsWith('.ts') || file.endsWith('.tsx'))
  
  if (!hasTypeScriptFiles) {
    missing.push('TypeScript files')
  }
  
  return {
    isTypeScript: missing.length === 0,
    missing
  }
}
```

## Default Handler Generation

From `src/cli/utils/generate-defaults.ts`:

```typescript
async function generateDefaults(buildDir = '.robo/build'): Promise<DefaultGen> {
  const config = getConfig()
  
  // Skip for disabled bot
  if (config.experimental?.disableBot === true) {
    return { commands: {}, context: {}, events: {} }
  }
  
  const commands = await generateCommands(distDir, config)
  const events = await generateEvents(distDir)
  
  return { commands, context: {}, events }
}
```

### Default Commands

```typescript
async function generateCommands(distDir, config) {
  const defaultCommandsDir = path.join(__DIRNAME, '..', '..', 'default', 'commands')
  const generated: Record<string, boolean> = {}
  
  await recursiveDirScan(defaultCommandsDir, async (file, fullPath) => {
    const commandKey = path.relative(defaultCommandsDir, fullPath).replace(ext, '')
    
    // Skip dev commands if not in debug mode
    const shouldCreateDev = config.defaults?.dev ?? true
    if (devCommands.includes(commandKey) && !DEBUG_MODE) {
      return
    }
    
    // Skip if user has their own implementation
    const fileExists = await checkFileExistence(srcPathBase)
    if (!fileExists) {
      await fs.copyFile(fullPath, distPath)
      generated[commandKey] = true
    }
  })
  
  return generated
}
```

### Default Events

```typescript
async function generateEvents(distDir) {
  const generated: Record<string, boolean> = {}
  
  await recursiveDirScan(defaultEventsDir, async (file, fullPath) => {
    // Use special prefix to prevent collisions
    const distFile = '__robo_' + file
    const distPath = path.join(distDir, 'events', basePath, distFile)
    
    // Always copy (don't check for existence)
    await fs.copyFile(fullPath, distPath)
    generated[eventKey] = true
  })
  
  return generated
}
```

## Manifest Generation

See [01-manifest-system.md](./01-manifest-system.md) for detailed manifest generation.

### Summary

```typescript
async function generateManifest(generatedDefaults, type: 'plugin' | 'robo') {
  const config = await loadConfig('robo', true)
  const pluginsManifest = type === 'plugin' ? BASE_MANIFEST : await readPluginManifest(config?.plugins)
  
  // Generate entries for each type
  const api = await generateEntries<ApiEntry>('api', [])
  const commands = await generateEntries<CommandEntry>('commands', Object.keys(generatedDefaults?.commands ?? {}))
  const context = await generateEntries<CommandEntry>('context', [])
  const events = await generateEntries<EventConfig>('events', Object.keys(generatedDefaults?.events ?? {}))
  const middleware = await generateEntries<MiddlewareEntry>('middleware', [])
  
  // Merge with plugin manifests
  const newManifest: Manifest = {
    ...BASE_MANIFEST,
    ...pluginsManifest,
    __robo: { config, language, mode, type, version },
    api: { ...pluginsManifest.api, ...api },
    commands: { ...pluginsManifest.commands, ...commands },
    // ...
  }
  
  // Calculate permissions and scopes
  newManifest.permissions = await generatePermissions(config)
  newManifest.scopes = generateScopes(config, newManifest)
  
  // Write manifest
  await fs.writeFile(path.join('.robo', 'manifest.json'), JSON.stringify(newManifest, jsonReplacer, 2))
  
  return newManifest
}
```

## Command Registration

### Change Detection

```typescript
function findCommandDifferences(
  oldCommands: Record<string, CommandEntry>,
  newCommands: Record<string, CommandEntry>,
  differenceType: 'added' | 'removed' | 'changed'
): string[] {
  const oldKeys = Object.keys(oldCommands)
  const newKeys = Object.keys(newCommands)
  
  if (differenceType === 'added') {
    return newKeys.filter((key) => !oldKeys.includes(key))
  } else if (differenceType === 'removed') {
    return oldKeys.filter((key) => !newKeys.includes(key))
  } else if (differenceType === 'changed') {
    return oldKeys.filter((key) => 
      newKeys.includes(key) && hasChangedFields(oldCommands[key], newCommands[key])
    )
  }
}
```

### Discord API Registration

```typescript
async function registerCommands(dev, force, newCommands, ...) {
  const clientId = env.get('discord.clientId')
  const guildId = env.get('discord.guildId')
  const token = env.get('discord.token')
  
  const rest = new REST({ version: '9' }).setToken(token)
  
  // Build command structures
  const slashCommands = buildSlashCommands(dev, newCommands, config)
  const contextMessageCommands = buildContextCommands(dev, messageContextCommands, 'message', config)
  const contextUserCommands = buildContextCommands(dev, userContextCommands, 'user', config)
  
  // Convert to API payloads
  const commandData = [
    ...slashCommands.map((cmd) => cmd.toJSON()),
    ...contextMessageCommands.map((cmd) => cmd.toJSON()),
    ...contextUserCommands.map((cmd) => cmd.toJSON())
  ]
  
  // Register with Discord
  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commandData })
  } else {
    await rest.put(Routes.applicationCommands(clientId), { body: commandData })
  }
}
```

## Plugin Build Process

### Plugin Build Command

From `src/cli/commands/build/plugin.ts`:

```typescript
async function pluginAction(_args: string[], options: PluginCommandOptions) {
  logger.info(`Building Robo plugin...`)
  
  const config = await loadConfig('robo', true)
  
  // Compile with plugin mode
  await Compiler.buildCode({
    excludePaths: config.excludePaths,
    plugin: true  // Enables declaration file generation
  })
  
  // Build seed files
  await Compiler.buildSeed()
  
  // Generate plugin manifest
  const manifest = await generateManifest(
    { commands: {}, context: {}, events: {} },
    'plugin'  // Type is 'plugin', not 'robo'
  )
  
  // Build public directory
  await buildPublicDirectory()
  
  // Print summary
  printBuildSummary(manifest, totalSize, startTime, true)
}
```

### Declaration File Generation

For plugins, TypeScript declaration files are generated:

```typescript
function buildDeclarationFiles(tsOptions: CompilerOptions) {
  // Use TypeScript compiler to generate .d.ts files
  const program = ts.createProgram(files, {
    ...tsOptions,
    declaration: true,
    emitDeclarationOnly: true,
    outDir: '.robo/build'
  })
  
  program.emit()
}
```

### Seed File Compilation

```typescript
async function buildSeed() {
  const SeedDir = path.join(process.cwd(), 'seed')
  const SeedBuildDir = path.join('.robo', 'seed')
  
  await rm(SeedBuildDir, { recursive: true, force: true })
  
  if (!existsSync(SeedDir)) {
    return { time: 0 }
  }
  
  // Compile TypeScript in seed directory
  const { isTypeScript } = Compiler.isTypescriptProject()
  if (isTypeScript) {
    await Compiler.buildCode({
      distDir: SeedBuildDir,
      srcDir: SeedDir
    })
  }
  
  // Copy non-TypeScript files
  await copyDir(SeedDir, SeedBuildDir, [], [])
  
  return { time: Date.now() - startTime }
}
```

## Incremental Builds

In development mode, only changed files are recompiled:

```typescript
// In dev.ts watcher
watcher.start(async (changes) => {
  // Pass changed files to build
  await buildAsync(null, config, verbose, changes)
})

// In buildCode
if (options?.files?.length > 0) {
  // Incremental build - only compile specified files
  files = options.files.map((file) => path.join(process.cwd(), file))
  // Skip directory traversal
}
```

## Build Output Structure

```
.robo/
├── build/                      # Compiled output
│   ├── api/                    # Compiled API routes
│   ├── commands/               # Compiled commands
│   ├── context/                # Compiled context menus
│   ├── events/                 # Compiled events
│   ├── middleware/             # Compiled middleware
│   └── modules/                # Compiled modules
├── config/                     # Compiled config files
├── manifest.json               # Generated manifest
├── public/                     # Static files (production)
└── seed/                       # Plugin seed files (plugin builds only)
```

## Key Observations for Decoupling

1. **Build is command-centric** - Command registration is integrated into build process

2. **SWC is the compiler** - Fast TypeScript compilation, could be swapped

3. **Manifest generation is centralized** - Single function generates all handler entries

4. **Default handlers are hardcoded** - Location and logic for default files is in core

5. **Plugin builds differ slightly** - Declaration files and seed compilation added

6. **Discord registration is build-time** - Not runtime, happens during `robo build`

7. **No plugin build hooks** - Plugins cannot extend the build process

8. **Directory structure is fixed** - Build scans predefined directories only

9. **Incremental builds exist** - Infrastructure for fast rebuilds already in place

10. **Public directory handling** - Static file copying for production builds

