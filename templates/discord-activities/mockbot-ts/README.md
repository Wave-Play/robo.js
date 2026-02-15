# MockBot Activity (TypeScript)

A testing template for Discord Activities using `@robojs/mock`. Provides a complete test suite covering unit tests, integration tests, and HMR (hot module replacement) tests.

No real Discord credentials are needed for testing.

## Getting Started

```bash
# Install dependencies
pnpm install

# Start the dev server
pnpm dev
```

## Testing

```bash
# Run all tests via the mock test pipeline
pnpm test

# Run only unit tests (no mock server required)
pnpm test:unit

# Run integration tests (starts mock server automatically)
pnpm test:integration
```

## Test Structure

- **`__tests__/unit/`** — Standard Jest tests that run without a mock server
- **`__tests__/integration/activity/`** — Activity lifecycle tests (server startup, session validation)
- **`__tests__/integration/api/`** — API route tests under mock mode
- **`__tests__/hmr/`** — Hot module replacement tests for API routes and utility dependencies

## Stack

- **Robo.js** — Framework runtime
- **@robojs/mock** — Discord Activity mocking (RPC host, proxy server, sessions)
- **@robojs/server** — File-based API routes (`src/api/`)
- **React** — Activity frontend (`src/app/`)
- **Vite** — Frontend dev server and bundler
- **Jest** — Test runner with `ts-jest` for TypeScript support
