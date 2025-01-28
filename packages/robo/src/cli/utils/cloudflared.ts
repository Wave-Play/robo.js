/**
 * This was forked from node-cloudflared (MIT License)
 * https://github.com/JacobLinCool/node-cloudflared
 */
import { color, composeColors } from './../../core/color.js'
import { cloudflareLogger } from '../../core/constants.js'
import { Nanocore } from '../../internal/nanocore.js'
import { IS_WINDOWS, waitForExit } from './utils.js'
import { execSync, spawn } from 'node:child_process'
import { loadEnv } from '../../core/dotenv.js'
import { Mode } from '../../core/mode.js'
import fs from 'node:fs'
import https from 'node:https'
import path from 'node:path'
import type { ChildProcess } from 'node:child_process'

interface OriginRequest { };

interface CreateDNSRecord {
	name: string;
	content: string;
	type: string;
	proxied: boolean;
	comment: string;
};

interface Ingress {
	hostname?: string;
	originRequest?: OriginRequest;
	path?: string;
	service: string;
};

interface TunnelConfig {
	config: {
		ingress: Ingress[];
		originRequest?: OriginRequest;
	};
};

interface TunnelConnection {
	client_id: string;
	client_version: string;
	colo_name: string;
	id: string;
	is_pending_reconnect: boolean;
	opened_at: string;
	origin_ip: string;
	uuid: string;
};

interface CFDTunnel {
	account_tag: string;
	connections: TunnelConnection[];
	conns_active_at: string | null;
	conns_inactive_at: string | null;
	created_at: string;
	deleted_at: string | null;
	id: string;
	metadata: Record<string, unknown>;
	name: string;
	remote_config: boolean;
	status: 'inactive' | 'degraded' | 'healthy' | 'down';
	tun_type: 'cfd_tunnel';
	token: string;
};

interface TunnelIngress {
	tunnel_id: string;
	version: number;
	config: TunnelConfig;
	"warp-routing": {
		enabled: boolean;
	};
};

interface CloudflareError {
	code: number;
	message: string;
};

interface CloudflareResponse {
	success: boolean;
	errors: CloudflareError[];
	messages: CloudflareError[];
	result: CFDTunnel | TunnelIngress | string;
	source?: string;
	created_at?: string;
	result_info?: {
		count: number;
		page: number;
		per_page: number;
		total_count: number;
	};
};

interface DNSRecord {
	id: string;
	zone_id: string;
	zone_name: string;
	name: string;
	type: string;
	content: string;
	proxiable: boolean;
	proxied: boolean;
	ttl: number;
	settings: Record<string, unknown>;
	meta: {
		auto_added: boolean;
		managed_by_apps: boolean;
		managed_by_argo_tunnel: boolean;
	};
	comment: string;
	tags: string[];
	created_on: string;
	modified_on: string;
	comment_modified_on: string;
};

interface DNSResponse {
	result: DNSRecord[];
	success: boolean;
	errors: CloudflareError[];
	messages: CloudflareError[];
};

interface CloudflareBody {
	config_src: 'cloudflare';
	name: string;
};

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

export function startCloudflared(url: string) {
	const ESCAPED_BIN_PATH = IS_WINDOWS ? `"${DEFAULT_BIN_PATH}"`: DEFAULT_BIN_PATH;
	cloudflareLogger.event(`Starting tunnel...`)
	cloudflareLogger.debug(ESCAPED_BIN_PATH + ' tunnel --url ' + url)
	const childProcess = spawn(ESCAPED_BIN_PATH, ['tunnel', '--url', url, '--no-autoupdate'], {
		shell: IS_WINDOWS,
		stdio: 'pipe'
	})
	let lastMessage = ''

	const onData = (data: Buffer) => {
		lastMessage = data.toString()?.trim()
		cloudflareLogger.debug(color.dim(lastMessage))

		const tunnelUrl = extractTunnelUrl(lastMessage)
		if (tunnelUrl && !Ignore.includes(tunnelUrl) && !lastMessage.includes('Request failed')) {
			cloudflareLogger.ready(`Tunnel URL:`, composeColors(color.bold, color.blue)(tunnelUrl))
			Nanocore.update('watch', { tunnelUrl })
		}
	}
	childProcess.stdout.on('data', onData)
	childProcess.stderr.on('data', onData)

	childProcess.on('exit', (code) => {
		if (code !== 0) {
			cloudflareLogger.error(lastMessage ?? 'Failed to start tunnel.')
		}
	})

	return childProcess
}

export function stopCloudflared(child: ChildProcess, signal: NodeJS.Signals = 'SIGINT') {
	child?.kill(signal)
	return waitForExit(child).then(() => {
		cloudflareLogger.debug('Tunnel stopped.')
	})
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

async function cloudflareRequest(endpoint: string, method: 'GET' | 'POST' | 'PUT' = 'GET', body: CloudflareBody | TunnelConfig | CreateDNSRecord | null = null): Promise<CloudflareResponse> {
	cloudflareLogger.debug(`Cloudflare API request: ${endpoint}`);

	const response = await fetch(`${CLOUDFLARE_API}${endpoint}`, {
		method,
		headers: {
			'Authorization': `Bearer ${process.env.CLOUDFLARE_API_KEY}`,
			'Content-Type': 'application/json',
		},
		body: body ? JSON.stringify(body) : null,
	});

	const data: CloudflareResponse = await response.json();

	if (!response.ok || !data.success) {
		cloudflareLogger.error(`Cloudflare API request failed: ${data.errors[0]?.message || 'Unknown error'}`);
	} else {
		cloudflareLogger.debug(`Cloudflare API request succeeded: ${endpoint}`)
	}

	return data;
}

async function updateTunnelConfig(id: string, accountId: string) {
	const tunnelConfig: TunnelConfig = {
		"config": {
			"ingress": [
				{
					"hostname": `robo.${process.env.CLOUDFLARE_DOMAIN}`,
					"service": `http://localhost:${process.env.PORT || 3000}`
				},
				{
					"service": "http_status:404"
				}
			]
		}
	};

	const tunnelConfigResponse = await cloudflareRequest(`/accounts/${accountId}/cfd_tunnel/${id}/configurations`, 'PUT', tunnelConfig);

	if (tunnelConfigResponse.success) {
		cloudflareLogger.debug(`Tunnel config updated: ${JSON.stringify(tunnelConfigResponse.result)}`);
		return true;
	} else {
		cloudflareLogger.error(`Failed to update tunnel config: ${JSON.stringify(tunnelConfigResponse.errors)}`);
		return false;
	}
}

async function createDNSRecord(tunnelID: string) {
	const dnsRecord: CreateDNSRecord = {
		"comment": "Robo.js CloudFlare Tunnel Proxy",
		"name": "robo",
		"proxied": true,
		"content": `${tunnelID}.cfargotunnel.com`,
		"type": "CNAME"
	};

	const existingRecords = await cloudflareRequest(`/zones/${process.env.CLOUDFLARE_ZONE_ID}/dns_records`, 'GET') as unknown as DNSResponse;

	if (existingRecords.success && existingRecords.result.length > 0) {
		const existingRecord = existingRecords.result.find(record => record.name === "robo");
		const updateResponse = await cloudflareRequest(`/zones/${process.env.CLOUDFLARE_ZONE_ID}/dns_records/${existingRecord.id}`, 'PUT', dnsRecord);

		if (updateResponse.success) {
			cloudflareLogger.debug(`DNS record updated: ${JSON.stringify(updateResponse.result)}`);
			return true;
		} else {
			cloudflareLogger.error(`Failed to update DNS record: ${JSON.stringify(updateResponse.errors)}`);
			return false;
		}
	} else {
		const createResponse = await cloudflareRequest(`/zones/${process.env.CLOUDFLARE_ZONE_ID}/dns_records`, 'POST', dnsRecord);
		
		if (createResponse.success) {
			cloudflareLogger.debug(`DNS record created: ${JSON.stringify(createResponse.result)}`);
			return true;
		} else {
			cloudflareLogger.error(`Failed to create DNS record: ${JSON.stringify(createResponse.errors)}`);
			return false;
		}
	}
}

async function updateEnvFile(key: string, value: string) {
	const regex = new RegExp(`^${key}=.*$`, 'm');
	let envContent = await fs.promises.readFile(path.join(process.cwd(), '.env'), 'utf8');

	if (regex.test(envContent)) {
		envContent = envContent.replace(regex, `${key}="${value}"`);
	} else {
		envContent += `\n${key}="${value}"`;
	}

	await fs.promises.writeFile(path.join(process.cwd(), '.env'), envContent, 'utf8');
	cloudflareLogger.debug(`Updated .env file with ${key}=${value}`);
}

async function reloadEnv() {
	cloudflareLogger.debug('Reloading environment variable ...');

	const defaultMode = Mode.get();
	await loadEnv({ mode: defaultMode, overwrite: true })
}

// function installService(token: string) {
// 	cloudflareLogger.debug(`Running command: ${DEFAULT_BIN_PATH} service install ${token}`);
// 	const childProcess = spawn(DEFAULT_BIN_PATH, ['service', 'install', token], {
// 		shell: IS_WINDOWS,
// 		stdio: 'pipe'
// 	});
// 	let lastMessage = ''
// 	const onData = (data: Buffer) => {
// 		lastMessage = data.toString()?.trim()
// 		cloudflareLogger.debug(color.dim(lastMessage))
// 	}
// 	childProcess.stdout.on('data', onData)
// 	childProcess.stderr.on('data', onData)
// 	childProcess.on('exit', (code) => {
// 		if (code !== 0) {
// 			cloudflareLogger.error(lastMessage ?? 'Failed to install tunnel.')
// 		}
// 	})
// }