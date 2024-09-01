/**
 * This was forked from node-cloudflared (MIT License)
 * https://github.com/JacobLinCool/node-cloudflared
 */
import { color, composeColors } from './../../core/color.js'
import { cloudflareLogger } from '../../core/constants.js'
import { IS_WINDOWS, waitForExit } from './utils.js'
import { execSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import https from 'node:https'
import path from 'node:path'
import type { ChildProcess } from 'node:child_process'

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
	cloudflareLogger.event(`Starting tunnel...`)
	cloudflareLogger.debug(DEFAULT_BIN_PATH + ' tunnel --url ' + url)
	const childProcess = spawn(DEFAULT_BIN_PATH, ['tunnel', '--url', url, '--no-autoupdate'], {
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
