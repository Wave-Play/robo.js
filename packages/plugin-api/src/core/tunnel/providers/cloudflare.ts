/**
 * Cloudflare Tunnel Provider
 *
 * This was forked from node-cloudflared (MIT License)
 * https://github.com/JacobLinCool/node-cloudflared
 */
import { logger } from '../../logger.js'
import { color, composeColors, Mode } from 'robo.js'
import { Nanocore } from 'robo.js/unstable.js'
import { execSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import https from 'node:https'
import path from 'node:path'
import type { ChildProcess } from 'node:child_process'
import type { TunnelProvider, TunnelInstance, TunnelProviderConfig } from '../types.js'

// Platform detection
const IS_WINDOWS = /^win/.test(process.platform)

// Cloudflare API types
type RecordType =
	| 'A'
	| 'AAAA'
	| 'CAA'
	| 'CERT'
	| 'CNAME'
	| 'DNSKEY'
	| 'DS'
	| 'HTTPS'
	| 'LOC'
	| 'MX'
	| 'NAPTR'
	| 'NS'
	| 'OPENPGPKEY'
	| 'PTR'
	| 'SMIMEA'
	| 'SRV'
	| 'SSHFP'
	| 'SVCB'
	| 'TLSA'
	| 'TXT'
	| 'URI'

type CloudflareRequestMethod = 'GET' | 'POST' | 'PUT' | 'PATCH'
type CloudflareRequestBody =
	| CloudflareTunnelRequest
	| CloudflareTunnelConfirationRequest
	| CloudflareDNSRecordListRequest
	| CloudflareDNSRecordCreateRequest
	| null

interface ResponseInfo {
	code: number
	message: string
}

interface CloudflareTunnelConfiguration {
	ingress?: Array<{
		hostname?: string
		service: string
		originRequest?: CloudflareOriginRequest
		path?: string
	}>
	originRequest?: CloudflareOriginRequest
	'warp-routing'?: {
		enabled?: boolean
	}
}

interface CloudflareTunnelRequest {
	config_src: 'cloudflare'
	name: string
}

interface CloudflareTunnelConfirationRequest {
	config: CloudflareTunnelConfiguration
}

interface CloudflareDNSRecordListRequest {
	comment?: {
		absent?: string
		contains?: string
		endswith?: string
		exact?: string
		present?: string
		startswith?: string
	}
	content?: {
		contains?: string
		endswith?: string
		exact?: string
		startswith?: string
	}
	direction?: 'asc' | 'desc'
	match?: 'any' | 'all'
	name?: {
		contains?: string
		endswith?: string
		exact?: string
		startswith?: string
	}
	order?: 'type' | 'name' | 'content' | 'ttl' | 'proxied'
	page?: number
	per_page?: number
	proxied?: boolean
	search?: string
	tag?: {
		absent?: string
		contains?: string
		endswith?: string
		exact?: string
		present?: string
		startswith?: string
	}
	tag_match?: 'any' | 'all'
	type?: RecordType
}

interface CloudflareDNSRecordCreateRequest {
	name: string
	content: string
	type: string
	proxied: boolean
	comment: string
}

interface CloudflareOriginRequest {
	access?: {
		audTag: string[]
		teamName: string
		required?: boolean
	}
	caPool?: string
	connectTimeout?: number
	disableChunkedEncoding?: boolean
	http2Origin?: boolean
	httpHostHeader?: string
	keepAliveConnections?: number
	keepAliveTimeout?: number
	noHappyEyeballs?: boolean
	noTLSVerify?: boolean
	originServerName?: string
	proxyType?: string
	tcpKeepAlive?: number
	tlsTimeout?: number
}

interface CloudflareDNSRecordResponse {
	id: string
	created_on: string
	meta: unknown
	modified_on: string
	proxiable: boolean
	comment_modified_on?: string
	tags_modified_on?: string
	comment?: string
	content?: string
	data?: {
		flags?: number
		tag?: string
		value?: string
		algorithm?: number
		certificate?: string
		key_tag?: number
		type?: number
		protocol?: number
		public_key?: string
		digest?: string
		digest_type?: number
		priority?: number
		target?: string
		altitude?: number
		lat_degrees?: number
		lat_direction?: 'N' | 'S'
		lat_minutes?: number
		lat_seconds?: number
		long_degrees?: number
		long_direction?: 'E' | 'W'
		long_minutes?: number
		long_seconds?: number
		precision_horz?: number
		precision_vert?: number
		size?: number
		order?: number
		preference?: number
		regex?: string
		replacement?: string
		service?: string
		matching_type?: number
		selector?: number
		usage?: number
		port?: number
		weight?: number
		fingerprint?: string
	}
	name?: string
	priority?: number
	proxied?: string
	settings?: {
		ipv4_only?: boolean
		ipv6_only?: boolean
		flatten_cname?: boolean
	}
	tags?: Array<string>
	ttl?: {
		UnionMember0: number
		UnionMember1: 1
	}
	type?: RecordType
}

interface CloudflareTunnelConfigurationResponse {
	account_id?: string
	config: CloudflareTunnelConfiguration
	created_at?: string
	source?: 'local' | 'cloudflare'
	tunnel_id?: string
	version?: number
}

interface CloudflareTunnelResponse {
	id?: string
	account_tag?: string
	connections?: Array<{
		id?: string
		client_id?: string
		client_version?: string
		colo_name?: string
		is_pending_reconnect?: boolean
		opened_at?: string
		origin_ip?: string
		uuid?: string
	}>
	conns_active_at?: string
	conns_inactive_at?: string
	created_at?: string
	deleted_at?: string
	metadata?: unknown
	name?: string
	remote_config?: boolean
	status?: 'inactive' | 'degraded' | 'healthy' | 'down'
	tun_type?: 'cfd_tunnel' | 'warp_connector' | 'ip_sec' | 'gre' | 'cni'
}

interface CloudflareResponse<T = unknown> {
	success: boolean
	errors: Array<ResponseInfo>
	messages: Array<ResponseInfo>
	result: T
	source?: string
	created_at?: string
	result_info?: {
		count: number
		page: number
		per_page: number
		total_count: number
	}
}

// Constants
const CLOUDFLARE_API = 'https://api.cloudflare.com/client/v4'
const CLOUDFLARED_VERSION = process.env.CLOUDFLARED_VERSION || 'latest'
const DEFAULT_BIN_PATH = path.join(process.cwd(), '.robo', 'bin', IS_WINDOWS ? 'cloudflared.exe' : 'cloudflared')
const RELEASE_BASE = 'https://github.com/cloudflare/cloudflared/releases/'
const Ignore = ['https://api.trycloudflare.com']

class UnsupportedError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'UnsupportedError'
	}
}

const LINUX_URL: Partial<Record<typeof process.arch, string>> = {
	arm64: 'cloudflared-linux-arm64',
	arm: 'cloudflared-linux-arm',
	x64: 'cloudflared-linux-amd64',
	ia32: 'cloudflared-linux-386'
}

const MACOS_URL: Partial<Record<typeof process.arch, string>> = {
	arm64: 'cloudflared-darwin-arm64.tgz',
	x64: 'cloudflared-darwin-amd64.tgz'
}

const WINDOWS_URL: Partial<Record<typeof process.arch, string>> = {
	x64: 'cloudflared-windows-amd64.exe',
	ia32: 'cloudflared-windows-386.exe'
}

/**
 * Cloudflare Tunnel Provider implementation.
 */
export class CloudflareProvider implements TunnelProvider {
	name = 'cloudflare'

	isInstalled(): boolean {
		return fs.existsSync(DEFAULT_BIN_PATH)
	}

	async install(): Promise<void> {
		logger.event('Installing Cloudflared...')

		if (process.platform === 'linux') {
			await this.installLinux()
		} else if (process.platform === 'darwin') {
			await this.installMacos()
		} else if (process.platform === 'win32') {
			await this.installWindows()
		} else {
			throw new UnsupportedError('Unsupported platform: ' + process.platform)
		}

		logger.info('Cloudflared installed successfully!')
	}

	async initialize(config: TunnelProviderConfig): Promise<boolean> {
		// Get config from params or environment
		const domain = config.domain ?? process.env.CLOUDFLARE_DOMAIN
		const apiKey = config.apiKey ?? process.env.CLOUDFLARE_API_KEY
		const zoneId = config.zoneId ?? process.env.CLOUDFLARE_ZONE_ID
		const accountId = config.accountId ?? process.env.CLOUDFLARE_ACCOUNT_ID

		if (!domain || !apiKey || !zoneId || !accountId) {
			return false
		}

		logger.debug('Looking for existing Cloudflare tunnels from .env file')
		if (process.env.CLOUDFLARE_TUNNEL_ID && process.env.CLOUDFLARE_TUNNEL_TOKEN) {
			logger.info('Using existing tunnel from .env file: ' + process.env.CLOUDFLARE_TUNNEL_ID)
			return true
		}
		logger.debug('No existing tunnel found in .env file')

		try {
			logger.debug('Looking for existing tunnels from Cloudflare account')

			const oldRoboTunnels = await this.cloudflareRequest<Array<CloudflareTunnelResponse>>(
				`/accounts/${accountId}/cfd_tunnel?name=robo`,
				'GET',
				null,
				apiKey
			)

			// If the very first call fails, abort early — no point cascading further calls
			// with the same bad credentials. Most common cause: wrong API token type or
			// missing permissions (needs Account: Cloudflare Tunnel + Zone: DNS edit).
			if (!oldRoboTunnels.success) {
				const reason = oldRoboTunnels.errors?.[0]?.message ?? 'Unknown error'
				logger.error(
					`Cloudflare authentication failed: ${reason}. ` +
					`Verify CLOUDFLARE_API_KEY is a scoped API Token (not the Global API Key) ` +
					`with "Account: Cloudflare Tunnel:Edit" and "Zone: DNS:Edit" permissions.`
				)
				return false
			}

			const oldRoboTunnelExists =
				oldRoboTunnels.result.length > 0
					? oldRoboTunnels.result.filter((tunnel) => tunnel.deleted_at === null)[0]
					: undefined

			// Resolve the tunnel id locally — never depend on process.env being updated
			// mid-run, since dotenv-style loaders won't re-import freshly written values.
			let tunnelId: string | undefined

			if (oldRoboTunnelExists?.id) {
				const oldRoboTunnel = oldRoboTunnelExists

				const oldRoboTunnelToken = await this.cloudflareRequest<string>(
					`/accounts/${accountId}/cfd_tunnel/${oldRoboTunnel.id}/token`,
					'GET',
					null,
					apiKey
				)

				if (!oldRoboTunnelToken.success) {
					logger.error(`Failed to fetch token for tunnel ${oldRoboTunnel.id}: ${oldRoboTunnelToken.errors?.[0]?.message ?? 'Unknown error'}`)
					return false
				}

				logger.info('Using existing tunnel from Cloudflare account: ' + oldRoboTunnel.id)
				await this.updateEnvFile('CLOUDFLARE_TUNNEL_ID', oldRoboTunnel.id!)
				await this.updateEnvFile('CLOUDFLARE_TUNNEL_TOKEN', oldRoboTunnelToken.result)
				tunnelId = oldRoboTunnel.id
			} else {
				logger.debug('Creating new tunnel for Cloudflare account')
				const newCloudflareTunnel: CloudflareTunnelRequest = {
					config_src: 'cloudflare',
					name: 'robo'
				}
				const newTunnel = await this.cloudflareRequest<CloudflareTunnelResponse>(
					`/accounts/${accountId}/cfd_tunnel`,
					'POST',
					newCloudflareTunnel,
					apiKey
				)

				if (!newTunnel.success || !newTunnel.result) {
					logger.error(`Failed to create tunnel: ${newTunnel.errors?.[0]?.message ?? 'Unknown error'}`)
					return false
				}

				const { id } = newTunnel.result
				logger.debug(`Created new tunnel: robo (${id})`)

				if (!id) {
					logger.error('Tunnel was created but no id was returned by Cloudflare.')
					return false
				}

				const newRoboTunnelToken = await this.cloudflareRequest<string>(
					`/accounts/${accountId}/cfd_tunnel/${id}/token`,
					'GET',
					null,
					apiKey
				)

				if (!newRoboTunnelToken.success) {
					logger.error(`Failed to fetch token for new tunnel ${id}: ${newRoboTunnelToken.errors?.[0]?.message ?? 'Unknown error'}`)
					return false
				}

				logger.info('Using newly created tunnel from Cloudflare account: ' + id)
				await this.updateEnvFile('CLOUDFLARE_TUNNEL_ID', id)
				await this.updateEnvFile('CLOUDFLARE_TUNNEL_TOKEN', newRoboTunnelToken.result)
				tunnelId = id
			}

			if (!tunnelId) {
				logger.error('Could not resolve a tunnel id — aborting.')
				return false
			}

			const handeledTunnelConfig = await this.handleTunnelConfig(tunnelId, accountId, domain, apiKey)
			logger.debug(`Updated tunnel config for ${tunnelId} with account ${accountId}`)

			if (!handeledTunnelConfig) {
				return false
			}

			const handeledDNSRecord = await this.handleDNSRecord(tunnelId, domain, zoneId, apiKey)
			logger.debug(`Updated DNS records for ${domain} with account ${accountId}`)

			if (!handeledDNSRecord) {
				return false
			}

			return true
		} catch (error) {
			logger.error('Failed to initialize Cloudflare tunnel: ', error)
			return false
		}
	}

	async start(url: string, config?: TunnelProviderConfig): Promise<TunnelInstance> {
		await this.reloadEnv()

		const { detached = false, timeout = 30000 } = config ?? {}
		const tunnelId = config?.tunnelId ?? process.env.CLOUDFLARE_TUNNEL_ID
		const tunnelDomain = config?.domain ?? process.env.CLOUDFLARE_DOMAIN
		const tunnelToken = config?.tunnelToken ?? process.env.CLOUDFLARE_TUNNEL_TOKEN

		let commandArgs = ['tunnel', '--no-autoupdate', '--url', url]

		if (tunnelId && tunnelToken && tunnelDomain) {
			commandArgs = [...commandArgs, 'run', '--token', tunnelToken, tunnelId]
		}

		logger.event(`Starting tunnel...`)
		logger.debug(DEFAULT_BIN_PATH, commandArgs.join(' '))

		// Determine static URL for configured tunnels
		const staticUrl = tunnelId && tunnelToken && tunnelDomain ? `https://robo.${tunnelDomain}` : undefined

		// For detached mode, use file-based output to avoid SIGPIPE when parent exits
		// Pipes would be closed on parent exit, killing the child with SIGPIPE
		if (detached) {
			const logFile = path.join(process.cwd(), '.robo', 'tunnel.log')

			// Ensure directory exists
			if (!fs.existsSync(path.dirname(logFile))) {
				fs.mkdirSync(path.dirname(logFile), { recursive: true })
			}

			// Clear/create log file
			fs.writeFileSync(logFile, '')

			// Open file handles for stdout/stderr
			const out = fs.openSync(logFile, 'a')
			const err = fs.openSync(logFile, 'a')

			const childProcess = spawn(DEFAULT_BIN_PATH, commandArgs, {
				detached: true,
				stdio: ['ignore', out, err]
			})

			// Wait for URL by polling the log file
			const resolvedUrl = await this.waitForUrlFromFile(logFile, staticUrl, timeout)

			// Close file handles in parent (child has its own)
			fs.closeSync(out)
			fs.closeSync(err)

			logger.ready(`Tunnel URL:`, composeColors(color.bold, color.blue)(resolvedUrl))
			Nanocore.update('watch', { tunnelUrl: resolvedUrl })

			return {
				process: childProcess,
				url: resolvedUrl,
				provider: this.name
			}
		}

		// Non-detached mode - use pipes for immediate output
		const childProcess = spawn(DEFAULT_BIN_PATH, commandArgs, {
			shell: IS_WINDOWS,
			stdio: ['ignore', 'pipe', 'pipe']
		})

		// Wait for URL to be resolved (with timeout)
		const resolvedUrl = await this.waitForUrl(childProcess, staticUrl, timeout)

		logger.ready(`Tunnel URL:`, composeColors(color.bold, color.blue)(resolvedUrl))
		Nanocore.update('watch', { tunnelUrl: resolvedUrl })

		return {
			process: childProcess,
			url: resolvedUrl,
			provider: this.name
		}
	}

	async stop(instance: TunnelInstance, signal: NodeJS.Signals = 'SIGINT'): Promise<void> {
		instance.process?.kill(signal)
		await this.waitForExit(instance.process)
		logger.debug('Tunnel stopped')
	}

	// Private helper methods
	private extractTunnelUrl(output: string): string | null {
		const regex = /https:\/\/[a-zA-Z0-9.-]*\.trycloudflare.com/
		const match = output.match(regex)
		return match ? match[0] : null
	}

	/**
	 * Wait for tunnel URL to be available from process output.
	 * For static tunnels (with configured domain), returns immediately.
	 * For quick tunnels, parses stdout/stderr for the generated URL.
	 */
	private waitForUrl(child: ChildProcess, staticUrl?: string, timeout = 30000): Promise<string> {
		return new Promise((resolve, reject) => {
			// Static tunnel - URL is known immediately
			if (staticUrl) {
				resolve(staticUrl)
				return
			}

			let lastMessage = ''

			const timer = setTimeout(() => {
				cleanup()
				reject(new Error(`Timeout waiting for tunnel URL after ${timeout}ms`))
			}, timeout)

			const cleanup = () => {
				clearTimeout(timer)
				child.stdout?.off('data', onData)
				child.stderr?.off('data', onData)
				child.off('exit', onExit)
			}

			const onData = (data: Buffer) => {
				lastMessage = data.toString().trim()
				logger.debug(color.dim(lastMessage))

				const tunnelUrl = this.extractTunnelUrl(lastMessage)
				if (tunnelUrl && !Ignore.includes(tunnelUrl) && !lastMessage.includes('Request failed')) {
					cleanup()
					resolve(tunnelUrl)
				}
			}

			const onExit = (code: number | null) => {
				cleanup()
				if (code !== 0) {
					reject(new Error(lastMessage || `Tunnel process exited with code ${code}`))
				}
			}

			child.stdout?.on('data', onData)
			child.stderr?.on('data', onData)
			child.on('exit', onExit)
		})
	}

	private waitForExit(child: ChildProcess): Promise<void> {
		return new Promise<void>((resolve) => {
			if (!child) {
				resolve()
			} else if (child.exitCode !== null) {
				resolve()
			} else {
				child.once('exit', () => resolve())
			}
		})
	}

	/**
	 * Wait for tunnel URL by polling a log file.
	 * Used for detached mode where we can't use pipes.
	 */
	private waitForUrlFromFile(logFile: string, staticUrl?: string, timeout = 30000): Promise<string> {
		return new Promise((resolve, reject) => {
			// Static tunnel - URL is known immediately
			if (staticUrl) {
				resolve(staticUrl)
				return
			}

			const startTime = Date.now()
			let lastPosition = 0

			const poll = () => {
				// Check timeout
				if (Date.now() - startTime > timeout) {
					reject(new Error(`Timeout waiting for tunnel URL after ${timeout}ms`))
					return
				}

				try {
					const content = fs.readFileSync(logFile, 'utf-8')

					// Only process new content
					if (content.length > lastPosition) {
						const newContent = content.slice(lastPosition)
						lastPosition = content.length

						logger.debug(color.dim(newContent.trim()))

						const tunnelUrl = this.extractTunnelUrl(newContent)
						if (tunnelUrl && !Ignore.includes(tunnelUrl) && !newContent.includes('Request failed')) {
							resolve(tunnelUrl)
							return
						}
					}
				} catch {
					// File might not exist yet or be locked
				}

				// Poll again after a short delay
				setTimeout(poll, 100)
			}

			poll()
		})
	}

	private resolveBase(version: string): string {
		if (version === 'latest') {
			return `${RELEASE_BASE}latest/download/`
		}
		return `${RELEASE_BASE}download/${version}/`
	}

	private async installLinux(version = CLOUDFLARED_VERSION): Promise<string> {
		const file = LINUX_URL[process.arch]

		if (file === undefined) {
			throw new UnsupportedError('Unsupported architecture: ' + process.arch)
		}

		await this.download(this.resolveBase(version) + file, DEFAULT_BIN_PATH)
		fs.chmodSync(DEFAULT_BIN_PATH, '755')
		return DEFAULT_BIN_PATH
	}

	private async installMacos(version = CLOUDFLARED_VERSION): Promise<string> {
		const file = MACOS_URL[process.arch]

		if (file === undefined) {
			throw new UnsupportedError('Unsupported architecture: ' + process.arch)
		}

		await this.download(this.resolveBase(version) + file, `${DEFAULT_BIN_PATH}.tgz`)
		logger.debug(`Extracting to ${DEFAULT_BIN_PATH}`)
		execSync(`tar -xzf ${path.basename(`${DEFAULT_BIN_PATH}.tgz`)}`, { cwd: path.dirname(DEFAULT_BIN_PATH) })
		fs.unlinkSync(`${DEFAULT_BIN_PATH}.tgz`)
		fs.renameSync(`${path.dirname(DEFAULT_BIN_PATH)}/cloudflared`, DEFAULT_BIN_PATH)
		return DEFAULT_BIN_PATH
	}

	private async installWindows(version = CLOUDFLARED_VERSION): Promise<string> {
		const file = WINDOWS_URL[process.arch]

		if (file === undefined) {
			throw new UnsupportedError('Unsupported architecture: ' + process.arch)
		}

		await this.download(this.resolveBase(version) + file, DEFAULT_BIN_PATH)
		return DEFAULT_BIN_PATH
	}

	private download(url: string, to: string, redirect = 0): Promise<string> {
		if (redirect === 0) {
			logger.debug(`Downloading ${url} to ${to}`)
		} else {
			logger.debug(`Redirecting to ${url}`)
		}

		if (!fs.existsSync(path.dirname(to))) {
			fs.mkdirSync(path.dirname(to), { recursive: true })
		}

		return new Promise<string>((resolve, reject) => {
			const request = https.get(url, (res) => {
				const redirect_code: unknown[] = [301, 302, 303, 307, 308]
				if (redirect_code.includes(res.statusCode) && res.headers.location !== undefined) {
					request.destroy()
					const redirection = res.headers.location
					resolve(this.download(redirection, to, redirect + 1))
					return
				}

				if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
					const file = fs.createWriteStream(to)

					file.on('finish', () => {
						file.close(() => resolve(to))
					})

					file.on('error', (err) => {
						fs.unlink(to, () => reject(err))
					})

					res.pipe(file)
				} else {
					request.destroy()
					reject(new Error(`HTTP response with status code: ${res.statusCode}`))
				}
			})

			request.on('error', (err) => {
				reject(err)
			})

			request.end()
		})
	}

	private async cloudflareRequest<T = unknown>(
		endpoint: string,
		method: CloudflareRequestMethod = 'GET',
		body: CloudflareRequestBody = null,
		apiKey: string
	): Promise<CloudflareResponse<T>> {
		logger.debug(`Cloudflare API request: ${method} ${endpoint}`)

		const response = await fetch(`${CLOUDFLARE_API}${endpoint}`, {
			method,
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json'
			},
			body: body ? JSON.stringify(body) : null
		})

		const data: CloudflareResponse = await response.json()

		if (!response.ok || !data.success) {
			// Surface full diagnostic info: HTTP status, every Cloudflare error code+message,
			// and the endpoint. The first-message-only summary used to hide the real cause.
			const formatted = (data.errors ?? [])
				.map((e) => `[${e.code}] ${e.message}`)
				.join('; ') || 'Unknown error'
			logger.error(`Cloudflare API request failed (${method} ${endpoint}, HTTP ${response.status}): ${formatted}`)
			const hint = this.diagnoseAuthError(data.errors ?? [])
			if (hint) logger.error(hint)
		} else {
			logger.debug(`Cloudflare API request succeeded: ${endpoint}`)
		}

		return data as CloudflareResponse<T>
	}

	/**
	 * Map common Cloudflare API error codes to actionable hints.
	 * "Authentication error" (10000) is overloaded — it covers both bad tokens
	 * and valid tokens with insufficient permissions.
	 */
	private diagnoseAuthError(errors: Array<ResponseInfo>): string | null {
		for (const err of errors) {
			switch (err.code) {
				case 10000: // Authentication error (generic)
				case 10001: // Unauthorized
					return 'Hint: Cloudflare returned an auth error. Verify (1) CLOUDFLARE_API_KEY is a scoped API Token (not the Global API Key), (2) the token has both "Account: Cloudflare Tunnel:Edit" and "Zone: DNS:Edit" permissions, and (3) it is scoped to the same Account/Zone as CLOUDFLARE_ACCOUNT_ID/CLOUDFLARE_ZONE_ID.'
				case 7003: // Could not route to /...
				case 7000: // No route for that URI
					return 'Hint: The endpoint was rejected. Double-check that CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_ZONE_ID are correct (no extra spaces or quotes).'
				case 9109: // Unauthorized to access requested resource
					return 'Hint: Token is valid but lacks permission for this account/zone. Re-create the token scoped to the correct account/zone.'
			}
		}
		return null
	}

	private async handleTunnelConfig(
		id: string,
		accountId: string,
		domain: string,
		apiKey: string
	): Promise<boolean> {
		const tunnelConfig: CloudflareTunnelConfirationRequest = {
			config: {
				ingress: [
					{
						hostname: `robo.${domain}`,
						service: `http://localhost:${process.env.PORT || 3000}`
					},
					{
						service: 'http_status:404'
					}
				]
			}
		}

		const tunnelConfigResponse = await this.cloudflareRequest<CloudflareTunnelConfigurationResponse>(
			`/accounts/${accountId}/cfd_tunnel/${id}/configurations/`,
			'PUT',
			tunnelConfig,
			apiKey
		)

		if (tunnelConfigResponse.success) {
			logger.debug(`Tunnel config updated: ${JSON.stringify(tunnelConfigResponse.result)}`)
			return true
		} else {
			logger.error(`Failed to update tunnel config: ${JSON.stringify(tunnelConfigResponse.errors)}`)
			return false
		}
	}

	private async handleDNSRecord(
		tunnelID: string,
		domain: string,
		zoneId: string,
		apiKey: string
	): Promise<boolean> {
		const existingDNSRecordFilter: CloudflareDNSRecordListRequest = {
			match: 'any',
			comment: {
				contains: 'robo'
			},
			content: {
				contains: 'cfargotunnel.com'
			},
			name: {
				contains: 'robo'
			},
			type: 'CNAME'
		}

		const existingDNSRecordFilterParams = new URLSearchParams(existingDNSRecordFilter as Record<string, string>)

		const dnsRecord: CloudflareDNSRecordCreateRequest = {
			comment: 'Robo.js Cloudflare Tunnel Proxy',
			name: 'robo',
			proxied: true,
			content: `${tunnelID}.cfargotunnel.com`,
			type: 'CNAME'
		}

		let recordExists
		const existingRecords = await this.cloudflareRequest<Array<CloudflareDNSRecordResponse>>(
			`/zones/${zoneId}/dns_records?${existingDNSRecordFilterParams}`,
			'GET',
			null,
			apiKey
		)
		if (existingRecords.success && existingRecords.result.length > 0) {
			recordExists = existingRecords.result.find((record) => record.name === `robo.${domain}`)
		}

		if (recordExists) {
			const existingRecord = recordExists
			const updateResponse = await this.cloudflareRequest<CloudflareDNSRecordResponse>(
				`/zones/${zoneId}/dns_records/${existingRecord.id}`,
				'PATCH',
				dnsRecord,
				apiKey
			)

			if (updateResponse.success) {
				logger.debug(`DNS record updated: ${JSON.stringify(updateResponse.result)}`)
				return true
			} else {
				logger.error(`Failed to update DNS record: ${JSON.stringify(updateResponse.errors)}`)
				return false
			}
		} else {
			const createResponse = await this.cloudflareRequest<CloudflareDNSRecordResponse>(
				`/zones/${zoneId}/dns_records`,
				'POST',
				dnsRecord,
				apiKey
			)

			if (createResponse.success) {
				logger.debug(`DNS record created: ${JSON.stringify(createResponse.result)}`)
				return true
			} else {
				logger.error(`Failed to create DNS record: ${JSON.stringify(createResponse.errors)}`)
				return false
			}
		}
	}

	private async updateEnvFile(key: string, value: string): Promise<void> {
		// Always update process.env immediately so the rest of this run sees the value.
		// File persistence is for subsequent runs; reloadEnv() can't be relied on to
		// re-import freshly written values into an already-running process.
		process.env[key] = value

		try {
			const envFilePath = await this.getEnvFilePath()

			if (envFilePath) {
				const regex = new RegExp(`^${key}=.*$`, 'm')
				let envContent = await fs.promises.readFile(envFilePath, 'utf8')

				if (regex.test(envContent)) {
					envContent = envContent.replace(regex, `${key}="${value}"`)
				} else {
					envContent += `\n${key}="${value}"`
				}

				await fs.promises.writeFile(envFilePath, envContent, 'utf8')
				logger.debug(`Updated ${envFilePath} file with ${key}=${value}`)
			}
		} catch (error) {
			logger.error(`Failed to update env file: ${error}`)
		}
	}

	private async getEnvFilePath(): Promise<string | undefined> {
		const mode = Mode.get()
		let filePath = path.join(process.cwd(), '.env')

		if (mode && fs.existsSync(filePath + '.' + mode)) {
			logger.debug('Found .env file for mode:', mode, ':', filePath + '.' + mode)
			filePath = path.join(process.cwd(), '.env' + '.' + mode)
		}

		if (!fs.existsSync(filePath)) {
			logger.debug(`No .env file found at "${filePath}"`)
			return
		}

		return filePath
	}

	private async reloadEnv(): Promise<void> {
		logger.debug('Reloading environment variable ...')

		try {
			const { Env } = await import('robo.js')
			const mode = Mode.get()
			await Env.load({ mode: mode })
		} catch {
			// Env.load may not be available in all contexts
			logger.debug('Could not reload env via Env.load')
		}
	}
}
