/**
 * Jest Global Setup for Integration Tests
 *
 * Starts the @robojs/mock server before any integration tests run.
 * The server runs for the entire test suite and is shared across all test files.
 */
const { spawn } = require('node:child_process')
const net = require('node:net')

// Allow self-signed certificates for voice gateway testing
// This must be set before any TLS connections are made
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const SERVER_STARTUP_TIMEOUT = 30000

async function getAvailablePort(preferredPort) {
	if (preferredPort) return preferredPort

	return new Promise((resolve, reject) => {
		const server = net.createServer()
		server.unref()
		server.on('error', reject)
		server.listen(0, '127.0.0.1', () => {
			const address = server.address()
			const port = typeof address === 'object' && address ? address.port : null
			server.close(() => {
				if (typeof port !== 'number') {
					reject(new Error('Failed to acquire an available port'))
					return
				}
				resolve(port)
			})
		})
	})
}

/**
 * Start the Robo server and wait for it to be ready
 */
async function startServer() {
	const chosenPort = await getAvailablePort(process.env.MOCK_PORT ? parseInt(process.env.MOCK_PORT, 10) : undefined)

	// Ensure test helpers use the chosen port
	process.env.MOCK_PORT = String(chosenPort)
	process.env.MOCK_REST_URL ??= `http://localhost:${chosenPort}/mock/api`
	process.env.MOCK_WS_URL ??= `ws://localhost:${chosenPort}`
	process.env.MOCK_CONTROL_URL ??= `http://localhost:${chosenPort}/mock/api/control`

	return new Promise((resolve, reject) => {
		console.log('\n[Global Setup] Starting mock server...')

		// Use 'robo dev' for development mode
		const proc = spawn('npx', ['robo', 'dev'], {
			cwd: __dirname.replace('/__tests__/integration', ''),
			stdio: ['pipe', 'pipe', 'pipe'],
			env: {
				...process.env,
				PORT: String(chosenPort),
				FORCE_COLOR: '0'
			},
			shell: true
		})

		let output = ''
		const timeout = setTimeout(() => {
			proc.kill()
			reject(new Error(`Server failed to start within ${SERVER_STARTUP_TIMEOUT}ms. Output:\n${output}`))
		}, SERVER_STARTUP_TIMEOUT)

		proc.stdout?.on('data', (data) => {
			output += data.toString()
			// Server is ready when we see the gateway message or server ready message
			if (output.includes('Gateway WebSocket server ready') || output.includes('Ready!') || output.includes('Server is live')) {
				clearTimeout(timeout)
				console.log('[Global Setup] Mock server started successfully')
				resolve(proc)
			}
		})

		proc.stderr?.on('data', (data) => {
			output += data.toString()
		})

		proc.on('error', (err) => {
			clearTimeout(timeout)
			reject(err)
		})

		proc.on('exit', (code) => {
			if (code !== 0 && code !== null) {
				clearTimeout(timeout)
				reject(new Error(`Server exited with code ${code}. Output:\n${output}`))
			}
		})
	})
}

module.exports = async () => {
	// Start the server
	const serverProcess = await startServer()

	// Store the server process globally so teardown can access it
	globalThis.__MOCK_SERVER_PROCESS__ = serverProcess

	// Wait a bit for the server to fully initialize
	await new Promise((resolve) => setTimeout(resolve, 500))
}
