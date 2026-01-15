# Build System

## Overview

Two-stage build process: React Stage UI compiled via Vite, then plugin code via Robo.js build system. Generates ~128 REST API routes with auto-discovery.

## Build Commands

```bash
# Full build (both stages)
npm run build        # build:stage && robo build plugin

# Stage UI only
npm run build:stage  # vite build --config config/vite.stage.mjs

# Watch modes
npm run dev          # robo build plugin --watch
npm run dev:stage    # vite build --config config/vite.stage.mjs --watch

# Testing
npm test             # All tests (ESM mode)
npm run test:unit    # Unit tests (parallel)
npm run test:integration  # Integration tests (sequential)
```

## Two-Stage Build Process

### Stage 1: React UI Build

```
npm run build:stage
  └─> vite build --config config/vite.stage.mjs
      ├─> Compiles src/app/** (React/TSX)
      ├─> Uses @vitejs/plugin-react-swc
      ├─> Outputs to public/stage/
      │   ├─> index.html
      │   ├─> assets/*.js (chunked bundles)
      │   ├─> assets/*.css (styles)
      │   └─> .build-signal (timestamp)
      └─> Relative import paths for portability
```

### Stage 2: Plugin Build

```
robo build plugin
  └─> Uses Robo.js build system
      ├─> Scans src/api/** for file-based routes
      ├─> Scans src/robo/** for lifecycle hooks
      ├─> Generates route manifest
      ├─> Transpiles src/** via SWC/TypeScript
      └─> Outputs to .robo/build/
```

## Vite Configuration

### Main Config (`config/vite.mjs`)

```javascript
export default defineConfig({
  plugins: [react()],
  server: { allowedHosts: true }
})
```

### Stage UI Config (`config/vite.stage.mjs`)

```javascript
export default defineConfig({
  plugins: [react(), buildSignal()],
  base: './',                    // Relative paths for portability
  publicDir: false,              // No public/ folder copying
  resolve: {
    alias: {
      '@': resolve(process.cwd(), 'src/app')
    }
  },
  build: {
    outDir: 'public/stage',
    emptyOutDir: true
  }
})
```

### Build Signal Plugin

Custom plugin for hot reload detection:

```javascript
function buildSignal() {
  return {
    name: 'robo-build-signal',
    closeBundle() {
      const signalPath = resolve(process.cwd(), 'public/stage/.build-signal')
      writeFileSync(signalPath, JSON.stringify({ timestamp: Date.now() }))
    }
  }
}
```

**Purpose:** @robojs/server polls this file to trigger browser reload in dev mode.

## TypeScript Configuration

**File:** `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "lib": ["esnext", "DOM", "DOM.Iterable"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

**Key settings:**
- `noEmit: true` - Type checking only (Vite/robo handles compilation)
- `moduleResolution: bundler` - Vite-optimized

## Robo.js Plugin Configuration

**File:** `config/robo.ts`

```typescript
export default <Config>{
  type: 'plugin',
  plugins: [
    ['@robojs/server', { cors: true, prefix: 'mock' }]
  ],
  watcher: {
    ignore: ['src/app', 'src/components', 'src/hooks']
  }
}
```

**Server Plugin Config:** `config/plugins/robojs/server.ts`

```typescript
export default {
  cors: true,
  prefix: '/mock'
}
```

Routes registered with `/mock` prefix in host projects.

## Route Manifest Generation

**Generated:** `.robo/manifest/production/routes/server.api.json`

~128 REST API endpoints auto-discovered from file structure:

```json
{
  "key": "v10/channels/[id]/messages",
  "path": "api/v10/channels/[id]/messages.js",
  "exports": {
    "default": true,
    "named": []
  },
  "metadata": {
    "methods": ["GET", "POST", "PUT", "PATCH", "DELETE"]
  },
  "id": "@robojs/mock:v10/channels/[id]/messages",
  "source": "plugin",
  "plugin": "@robojs/mock"
}
```

**Route categories:**
- Discord API v10 (~85 routes)
- Control API (~35 routes)
- Stage API (~5 routes)
- CDN routes (~3 routes)

**Dynamic segments:** `[id]`, `[channelId]`, `[userId]` → path variables

## Jest Configuration

**File:** `jest.config.ts`

```typescript
const tsJestConfig = {
  useESM: true,
  isolatedModules: true,
  tsconfig: {
    module: 'ESNext',
    target: 'ES2022',
    moduleResolution: 'node'
  }
}

const config: Config = {
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', tsJestConfig]
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@/(.*)\\.js$': '<rootDir>/src/$1',
    '^robo\\.js$': '<rootDir>/__mocks__/robo.js.ts'
  },
  projects: [
    {
      displayName: 'unit',
      testMatch: ['<rootDir>/__tests__/**/*.test.ts'],
      testPathIgnorePatterns: ['<rootDir>/__tests__/integration/']
    },
    {
      displayName: 'integration',
      testMatch: ['<rootDir>/__tests__/integration/**/*.test.ts'],
      globalSetup: '<rootDir>/__tests__/integration/global-setup.js',
      globalTeardown: '<rootDir>/__tests__/integration/global-teardown.js',
      setupFilesAfterEnv: ['<rootDir>/__tests__/integration/test-setup.js']
    }
  ]
}
```

**ESM Support:**
```bash
NODE_OPTIONS="--experimental-vm-modules --disable-warning=ExperimentalWarning"
```

## Output Structure

### Build Output (`.robo/build/`)

```
.robo/build/
├── index.js             # Main entry (15+ KB)
├── api/                 # REST routes (~128 files)
│   ├── control/         # Session management
│   ├── v10/             # Discord API v10
│   ├── cdn/             # Attachments
│   └── stage/           # Stage UI routes
├── core/                # Gateway, Voice, Stage servers
├── session/             # Session management
├── robo/                # Lifecycle hooks
├── types/
├── utils/
├── discord/
├── storage/
├── openapi.json         # OpenAPI spec
└── *.d.ts               # Type definitions
```

### Manifest (`./robo/manifest/`)

```
.robo/manifest/production/
├── routes/
│   ├── @.json              # Route metadata
│   └── server.api.json     # Full route list
├── hooks/
│   ├── init.json
│   ├── start.json
│   └── stop.json
├── plugins.json            # Plugin registry
└── robo.json               # Build config
```

### Stage UI (`public/stage/`)

```
public/stage/
├── index.html              # Entry point
├── assets/
│   ├── index-XXX.js        # Main bundle
│   ├── App-YYY.js          # App chunk
│   └── style-ZZZ.css       # Styles
└── .build-signal           # Build timestamp
```

## Package Exports

```json
{
  "main": ".robo/build/index.js",
  "types": ".robo/build/index.d.ts",
  "exports": {
    ".": {
      "import": "./.robo/build/index.js",
      "types": "./.robo/build/index.d.ts"
    },
    "./session": {
      "import": "./.robo/build/session/index.js",
      "types": "./.robo/build/session/index.d.ts"
    },
    "./testing": {
      "import": "./.robo/build/testing/index.js",
      "types": "./.robo/build/testing/index.d.ts"
    },
    "./testing/jest-reporter": {
      "types": "./.robo/build/testing/jest-reporter.d.ts",
      "require": "./src/testing/jest-reporter.cjs",
      "import": "./.robo/build/testing/jest-reporter.js"
    }
  }
}
```

## Files Included in npm Package

```json
{
  "files": [
    ".robo/",           // Compiled output + manifest
    "public/",          // Stage UI assets
    "src/",             // Source (types + comments)
    "LICENSE",
    "README.md"
  ]
}
```

## Key Files

| Purpose | Path |
|---------|------|
| Build Scripts | `package.json` |
| Vite Main | `config/vite.mjs` |
| Vite Stage | `config/vite.stage.mjs` |
| TypeScript | `tsconfig.json` |
| Robo Config | `config/robo.ts` |
| Server Plugin | `config/plugins/robojs/server.ts` |
| Jest Config | `jest.config.ts` |
| Route Manifest | `.robo/manifest/production/routes/server.api.json` |

## Summary

| Feature | Implementation |
|---------|----------------|
| UI Build | Vite + React SWC |
| Plugin Build | robo build plugin |
| Route Discovery | File-based auto-scan |
| ESM Support | ts-jest + NODE_OPTIONS |
| Hot Reload | .build-signal timestamp |
| Portability | Relative base paths |
