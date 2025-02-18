/**
 * This was forked from node-cloudflared (MIT License)
 * https://github.com/JacobLinCool/node-cloudflared
 */
import { color, composeColors } from './../../core/color.js'
import { cloudflareLogger } from '../../core/constants.js'
import { Nanocore } from '../../internal/nanocore.js'
import { IS_WINDOWS, waitForExit } from './utils.js'
import { execSync, spawn } from 'node:child_process'
import { Env } from '../../core/env.js'
import { Mode } from '../../core/mode.js'
import fs from 'node:fs'
import https from 'node:https'
import path from 'node:path'
import type { ChildProcess } from 'node:child_process'

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
	// Yeah, still no Apple Silicon support... https://github.com/cloudflare/cloudflared/issues/389
	arm64: 'cloudflared-darwin-amd64.tgz',
	x64: 'cloudflared-darwin-amd64.tgz'
}

const WINDOWS_URL: Partial<Record<typeof process.arch, string>> = {
	x64: 'cloudflared-windows-amd64.exe',
	ia32: 'cloudflared-windows-386.exe'
}

function resolveBase(version: string): string {
	if (version === 'latest') {
		return `${RELEASE_BASE}latest/download/`
	}
	return `${RELEASE_BASE}download/${version}/`
}

/**
 * Install cloudflared to the given path.
 * @param to The path to the binary to install.
 * @param version The version of cloudflared to install.
 * @returns The path to the binary that was installed.
 */
export async function installCloudflared(to = DEFAULT_BIN_PATH, version = CLOUDFLARED_VERSION): Promise<string> {
	if (process.platform === 'linux') {
		return installLinux(to, version)
	} else if (process.platform === 'darwin') {
		return installMacos(to, version)
	} else if (process.platform === 'win32') {
		return installWindows(to, version)
	} else {
		throw new UnsupportedError('Unsupported platform: ' + process.platform)
	}
}

export function isCloudflaredInstalled(to = DEFAULT_BIN_PATH): boolean {
	return fs.existsSync(to)
}

export async function initializeCloudflareTunnel(): Promise<boolean> {
	if (
		!process.env.CLOUDFLARE_DOMAIN ||
		!process.env.CLOUDFLARE_API_KEY ||
		!process.env.CLOUDFLARE_ZONE_ID ||
		!process.env.CLOUDFLARE_ACCOUNT_ID
	) {
		return false
	}

	cloudflareLogger.debug('Looking for existing Cloudflare tunnels from .env file')
	if (process.env.CLOUDFLARE_TUNNEL_ID && process.env.CLOUDFLARE_TUNNEL_TOKEN) {
		cloudflareLogger.info('Using existing tunnel from .env file: ' + process.env.CLOUDFLARE_TUNNEL_ID)
		return true
	}
	cloudflareLogger.debug('No existing tunnel found in .env file')

	try {
		cloudflareLogger.debug('Looking for existing tunnels from Cloudflare account')

		const oldRoboTunnels = await cloudflareRequest<Array<CloudflareTunnelResponse>>(
			`/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/cfd_tunnel?name=robo`
		)

		let oldRoboTunnelExists
		if (oldRoboTunnels.success && oldRoboTunnels.result.length > 0) {
			oldRoboTunnelExists = oldRoboTunnels.result.filter((tunnel) => tunnel.deleted_at === null)[0]
		}

		if (oldRoboTunnelExists) {
			const oldRoboTunnel = oldRoboTunnelExists

			if (oldRoboTunnel.id) {
				const oldRoboTunnelToken = await cloudflareRequest<string>(
					`/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/cfd_tunnel/${oldRoboTunnel.id}/token`
				)

				cloudflareLogger.info('Using existing tunnel from Cloudflare account: ' + oldRoboTunnel.id)
				await updateEnvFile('CLOUDFLARE_TUNNEL_ID', oldRoboTunnel.id)
				await updateEnvFile('CLOUDFLARE_TUNNEL_TOKEN', oldRoboTunnelToken.result)
			}
		} else {
			cloudflareLogger.debug('Creating new tunnel for Cloudflare account')
			const newCloudflareTunnel: CloudflareTunnelRequest = {
				config_src: 'cloudflare',
				name: 'robo'
			}
			const newTunnel = await cloudflareRequest<CloudflareTunnelResponse>(
				`/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/cfd_tunnel`,
				'POST',
				newCloudflareTunnel
			)
			const { id } = newTunnel.result
			cloudflareLogger.debug(`Created new tunnel: robo (${id})`)

			if (id) {
				const newRoboTunnelToken = await cloudflareRequest<string>(
					`/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/cfd_tunnel/${id}/token`
				)

				cloudflareLogger.info('Using newly created tunnel from Cloudflare account: ' + id)
				await updateEnvFile('CLOUDFLARE_TUNNEL_ID', id)
				await updateEnvFile('CLOUDFLARE_TUNNEL_TOKEN', newRoboTunnelToken.result)
			}
		}

		await reloadEnv()

		const handeledTunnelConfig = await handleTunnelConfig(
			process.env.CLOUDFLARE_TUNNEL_ID,
			process.env.CLOUDFLARE_ACCOUNT_ID
		)
		cloudflareLogger.debug(
			`Updated tunnel config for ${process.env.CLOUDFLARE_TUNNEL_ID} with account ${process.env.CLOUDFLARE_ACCOUNT_ID}`
		)

		if (!handeledTunnelConfig) {
			return false
		}

		const handeledDNSRecord = await handleDNSRecord(process.env.CLOUDFLARE_TUNNEL_ID)
		cloudflareLogger.debug(
			`Updated DNS records for ${process.env.CLOUDFLARE_DOMAIN} with account ${process.env.CLOUDFLARE_ACCOUNT_ID}`
		)

		if (!handeledDNSRecord) {
			return false
		}

		return true
	} catch (error) {
		cloudflareLogger.error('Failed to initialize Cloudflare tunnel: ', error)
		return false
	}
}

export async function startCloudflared(url: string) {
	await reloadEnv()

	const tunnelId = process.env.CLOUDFLARE_TUNNEL_ID
	const tunnelDomain = process.env.CLOUDFLARE_DOMAIN
	const tunnelToken = process.env.CLOUDFLARE_TUNNEL_TOKEN
	const ESCAPED_BIN_PATH = IS_WINDOWS ? `"${DEFAULT_BIN_PATH}"` : DEFAULT_BIN_PATH

	let commandArgs = ['tunnel', '--no-autoupdate', '--url', url]

	if (tunnelId && tunnelToken && tunnelDomain) {
		commandArgs = [...commandArgs, 'run', '--token', tunnelToken, tunnelId]
	}

	cloudflareLogger.event(`Starting tunnel...`)
	cloudflareLogger.debug(ESCAPED_BIN_PATH + commandArgs)

	const childProcess = spawn(DEFAULT_BIN_PATH, commandArgs, {
		shell: IS_WINDOWS,
		stdio: 'pipe'
	})

	let lastMessage = ''

	const onData = (data: Buffer) => {
		lastMessage = data.toString()?.trim()

		cloudflareLogger.debug(color.dim(lastMessage))

		const tunnelUrl =
			tunnelId && tunnelToken && tunnelDomain ? `https://robo.${tunnelDomain}` : extractTunnelUrl(lastMessage)

		if (tunnelUrl && !Ignore.includes(tunnelUrl) && !lastMessage.includes('Request failed')) {
			cloudflareLogger.ready(`Tunnel URL:`, composeColors(color.bold, color.blue)(tunnelUrl))
			Nanocore.update('watch', { tunnelUrl })
		}
	}
	childProcess.stdout.on('data', onData)
	childProcess.stderr.on('data', onData)

	childProcess.on('exit', (code) => {
		if (code !== 0) {
			cloudflareLogger.error(lastMessage ?? 'Failed to start tunnel')
		}
	})

	return childProcess
}

export async function stopCloudflared(child: ChildProcess, signal: NodeJS.Signals = 'SIGINT') {
	child?.kill(signal)
	await waitForExit(child)
	cloudflareLogger.debug('Tunnel stopped')
}

function extractTunnelUrl(output: string): string | null {
	const regex = /https:\/\/[a-zA-Z0-9.-]*\.trycloudflare.com/
	const match = output.match(regex)
	return match ? match[0] : null
}

async function installLinux(to: string, version = CLOUDFLARED_VERSION): Promise<string> {
	const file = LINUX_URL[process.arch]

	if (file === undefined) {
		throw new UnsupportedError('Unsupported architecture: ' + process.arch)
	}

	await download(resolveBase(version) + file, to)
	fs.chmodSync(to, '755')
	return to
}

async function installMacos(to: string, version = CLOUDFLARED_VERSION): Promise<string> {
	const file = MACOS_URL[process.arch]

	if (file === undefined) {
		throw new UnsupportedError('Unsupported architecture: ' + process.arch)
	}

	await download(resolveBase(version) + file, `${to}.tgz`)
	cloudflareLogger.debug(`Extracting to ${to}`)
	execSync(`tar -xzf ${path.basename(`${to}.tgz`)}`, { cwd: path.dirname(to) })
	fs.unlinkSync(`${to}.tgz`)
	fs.renameSync(`${path.dirname(to)}/cloudflared`, to)
	return to
}

async function installWindows(to: string, version = CLOUDFLARED_VERSION): Promise<string> {
	const file = WINDOWS_URL[process.arch]

	if (file === undefined) {
		throw new UnsupportedError('Unsupported architecture: ' + process.arch)
	}

	await download(resolveBase(version) + file, to)
	return to
}

function download(url: string, to: string, redirect = 0): Promise<string> {
	if (redirect === 0) {
		cloudflareLogger.debug(`Downloading ${url} to ${to}`)
	} else {
		cloudflareLogger.debug(`Redirecting to ${url}`)
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
				resolve(download(redirection, to, redirect + 1))
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

async function cloudflareRequest<T = unknown>(
	endpoint: string,
	method: CloudflareRequestMethod = 'GET',
	body: CloudflareRequestBody = null
): Promise<CloudflareResponse<T>> {
	cloudflareLogger.debug(`Cloudflare API request: ${endpoint}`)

	const response = await fetch(`${CLOUDFLARE_API}${endpoint}`, {
		method,
		headers: {
			Authorization: `Bearer ${process.env.CLOUDFLARE_API_KEY}`,
			'Content-Type': 'application/json'
		},
		body: body ? JSON.stringify(body) : null
	})

	const data: CloudflareResponse = await response.json()

	if (!response.ok || !data.success) {
		cloudflareLogger.error(`Cloudflare API request failed: ${data.errors[0]?.message || 'Unknown error'}`)
	} else {
		cloudflareLogger.debug(`Cloudflare API request succeeded: ${endpoint}`)
	}

	return data as CloudflareResponse<T>
}

async function handleTunnelConfig(id: string, accountId: string) {
	const tunnelConfig: CloudflareTunnelConfirationRequest = {
		config: {
			ingress: [
				{
					hostname: `robo.${process.env.CLOUDFLARE_DOMAIN}`,
					service: `http://localhost:${process.env.PORT || 3000}`
				},
				{
					service: 'http_status:404'
				}
			]
		}
	}

	const tunnelConfigResponse = await cloudflareRequest<CloudflareTunnelConfigurationResponse>(
		`/accounts/${accountId}/cfd_tunnel/${id}/configurations/`,
		'PUT',
		tunnelConfig
	)

	if (tunnelConfigResponse.success) {
		cloudflareLogger.debug(`Tunnel config updated: ${JSON.stringify(tunnelConfigResponse.result)}`)
		return true
	} else {
		cloudflareLogger.error(`Failed to update tunnel config: ${JSON.stringify(tunnelConfigResponse.errors)}`)
		return false
	}
}

async function handleDNSRecord(tunnelID: string) {
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
	const existingRecords = await cloudflareRequest<Array<CloudflareDNSRecordResponse>>(
		`/zones/${process.env.CLOUDFLARE_ZONE_ID}/dns_records?${existingDNSRecordFilterParams}`,
		'GET'
	)
	if (existingRecords.success && existingRecords.result.length > 0) {
		recordExists = existingRecords.result.find((record) => record.name === `robo.${process.env.CLOUDFLARE_DOMAIN}`)
	}

	if (recordExists) {
		const existingRecord = recordExists
		const updateResponse = await cloudflareRequest<CloudflareDNSRecordResponse>(
			`/zones/${process.env.CLOUDFLARE_ZONE_ID}/dns_records/${existingRecord.id}`,
			'PATCH',
			dnsRecord
		)

		if (updateResponse.success) {
			cloudflareLogger.debug(`DNS record updated: ${JSON.stringify(updateResponse.result)}`)
			return true
		} else {
			cloudflareLogger.error(`Failed to update DNS record: ${JSON.stringify(updateResponse.errors)}`)
			return false
		}
	} else {
		const createResponse = await cloudflareRequest<CloudflareDNSRecordResponse>(
			`/zones/${process.env.CLOUDFLARE_ZONE_ID}/dns_records`,
			'POST',
			dnsRecord
		)

		if (createResponse.success) {
			cloudflareLogger.debug(`DNS record created: ${JSON.stringify(createResponse.result)}`)
			return true
		} else {
			cloudflareLogger.error(`Failed to create DNS record: ${JSON.stringify(createResponse.errors)}`)
			return false
		}
	}
}

async function updateEnvFile(key: string, value: string) {
	try {
		const envFilePath = await getEnvFilePath()

		if (envFilePath) {
			const regex = new RegExp(`^${key}=.*$`, 'm')
			let envContent = await fs.promises.readFile(envFilePath, 'utf8')

			if (regex.test(envContent)) {
				envContent = envContent.replace(regex, `${key}="${value}"`)
			} else {
				envContent += `\n${key}="${value}"`
			}

			await fs.promises.writeFile(envFilePath, envContent, 'utf8')
			cloudflareLogger.debug(`Updated ${envFilePath} file with ${key}=${value}`)
		} else {
			process.env[key] = value
		}
	} catch (error) {
		cloudflareLogger.error(`Failed to update env file: ${error}`)
		process.env[key] = value
	}
}

async function getEnvFilePath() {
	const mode = Mode.get()
	let filePath = path.join(process.cwd(), '.env')

	if (mode && fs.existsSync(filePath + '.' + mode)) {
		cloudflareLogger.debug('Found .env file for mode:', mode, ':', filePath + '.' + mode)
		filePath = path.join(process.cwd(), '.env' + '.' + mode)
	}

	if (!fs.existsSync(filePath)) {
		cloudflareLogger.debug(`No .env file found at "${filePath}"`)
		return
	}

	return filePath
}

async function reloadEnv() {
	cloudflareLogger.debug('Reloading environment variable ...')

	const mode = Mode.get()
	await Env.load({ mode: mode })
}