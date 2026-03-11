"use client"

import * as React from "react"
import { useState, useEffect, useRef, cloneElement, isValidElement } from "react"
import { Badge } from "./ui/badge"
import { ExaShape } from "./ui/exa-shape"

interface CompatPlugin {
	name: string
	href: string
	description?: string
}

interface PluginHeroProps {
	name: string
	description: string
	icon?: React.ReactNode
	github?: string
	npm?: string
	deprecated?: boolean
	platforms?: ("Bots" | "Activities" | "Web")[]
	requires?: CompatPlugin[]
	optional?: CompatPlugin[]
}

interface NpmData {
	version: string
	unpackedSize?: number
}

interface BundleData {
	gzip: number
	raw: number
}

// Module-level caches shared across all PluginHero instances
const npmCache = new Map<string, { data: NpmData; fetchedAt: number }>()
const bundleCache = new Map<string, { data: BundleData; fetchedAt: number }>()
const CACHE_TTL = 60 * 60 * 1000 // 1 hour
const inflightNpmRequests = new Map<string, Promise<NpmData | null>>()
const inflightBundleRequests = new Map<string, Promise<BundleData | null>>()

async function fetchNpmData(packageName: string): Promise<NpmData | null> {
	const cached = npmCache.get(packageName)
	if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
		return cached.data
	}

	const inflight = inflightNpmRequests.get(packageName)
	if (inflight) return inflight

	const request = (async () => {
		try {
			const res = await fetch(`https://registry.npmjs.org/${packageName}/latest`)
			if (!res.ok) return null
			const json = await res.json()
			const data: NpmData = {
				version: json.version,
				unpackedSize: json.dist?.unpackedSize,
			}
			npmCache.set(packageName, { data, fetchedAt: Date.now() })
			return data
		} catch {
			return null
		} finally {
			inflightNpmRequests.delete(packageName)
		}
	})()

	inflightNpmRequests.set(packageName, request)
	return request
}

async function fetchBundleSize(packageName: string): Promise<BundleData | null> {
	const cached = bundleCache.get(packageName)
	if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
		return cached.data
	}

	const inflight = inflightBundleRequests.get(packageName)
	if (inflight) return inflight

	const request = (async () => {
		try {
			const res = await fetch(`https://bundlephobia.com/api/size?package=${encodeURIComponent(packageName)}`)
			if (!res.ok) return null
			const json = await res.json()
			const data: BundleData = { gzip: json.gzip, raw: json.size }
			bundleCache.set(packageName, { data, fetchedAt: Date.now() })
			return data
		} catch {
			return null
		} finally {
			inflightBundleRequests.delete(packageName)
		}
	})()

	inflightBundleRequests.set(packageName, request)
	return request
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const NpmIcon = ({ size = 14 }: { size?: number }) => (
	<svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
		<path d="M1.763 0C.786 0 0 .786 0 1.763v20.474C0 23.214.786 24 1.763 24h20.474c.977 0 1.763-.786 1.763-1.763V1.763C24 .786 23.214 0 22.237 0zM5.13 5.323h13.837v13.548h-3.464V8.691h-3.366v10.18H5.13z" />
	</svg>
)

const GitHubIcon = ({ size = 14 }: { size?: number }) => (
	<svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
		<path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
	</svg>
)

const DiscordIcon = ({ size = 14 }: { size?: number }) => (
	<svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
		<path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
	</svg>
)

const CopyIcon = () => (
	<svg xmlns="http://www.w3.org/2000/svg" width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter">
		<rect width="14" height="14" x="8" y="8" rx="0" />
		<path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
	</svg>
)

const CheckIcon = () => (
	<svg xmlns="http://www.w3.org/2000/svg" width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter">
		<path d="M20 6 9 17l-5-5" />
	</svg>
)

const ChevronIcon = ({ open }: { open: boolean }) => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width={14}
		height={14}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="square"
		strokeLinejoin="miter"
		className="transition-transform duration-200"
		style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
	>
		<path d="m9 18 6-6-6-6" />
	</svg>
)

const BotIcon = () => (
	<svg xmlns="http://www.w3.org/2000/svg" width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter">
		<path d="M12 8V4H8" />
		<rect width="16" height="12" x="4" y="8" rx="0" />
		<path d="M2 14h2" />
		<path d="M20 14h2" />
		<path d="M15 13v2" />
		<path d="M9 13v2" />
	</svg>
)

const GamepadIcon = () => (
	<svg xmlns="http://www.w3.org/2000/svg" width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter">
		<line x1="6" x2="10" y1="12" y2="12" />
		<line x1="8" x2="8" y1="10" y2="14" />
		<line x1="15" x2="15.01" y1="13" y2="13" />
		<line x1="18" x2="18.01" y1="11" y2="11" />
		<rect width="20" height="12" x="2" y="6" rx="0" />
	</svg>
)

const GlobeSmallIcon = () => (
	<svg xmlns="http://www.w3.org/2000/svg" width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter">
		<circle cx="12" cy="12" r="10" />
		<path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
		<path d="M2 12h20" />
	</svg>
)

const platformIcons: Record<string, React.ReactNode> = {
	Bots: <BotIcon />,
	Activities: <GamepadIcon />,
	Web: <GlobeSmallIcon />,
}

const platformLabels: Record<string, string> = {
	Bots: "Discord Bots",
	Activities: "Discord Activities",
	Web: "Web",
}

export function PluginHero({ name, description, icon, github, npm, deprecated, platforms, requires, optional }: PluginHeroProps) {
	const [copied, setCopied] = useState(false)
	const [preview, setPreview] = useState(false)
	const [version, setVersion] = useState<string | null>(null)
	const [unpackedSize, setUnpackedSize] = useState<number | null>(null)
	const [bundleSize, setBundleSize] = useState<BundleData | null>(null)
	const [compatOpen, setCompatOpen] = useState(false)
	const iconRef = useRef<{ startAnimation: () => void; stopAnimation: () => void } | null>(null)
	const cardRef = useRef<HTMLDivElement>(null)

	const allCompat = [
		...(requires ?? []).map((d) => ({ ...d, kind: "required" as const })),
		...(optional ?? []).map((d) => ({ ...d, kind: "optional" as const })),
	]

	const npmUrl = npm ?? `https://www.npmjs.com/package/${name}`
	const installCmd = `npx robo add ${name}`
	const previewCmd = `npx robo add https://pkg.pr.new/${name}@next`
	const activeCmd = preview ? previewCmd : installCmd

	useEffect(() => {
		fetchNpmData(name).then((data) => {
			if (data) {
				setVersion(data.version)
				if (data.unpackedSize) setUnpackedSize(data.unpackedSize)
			}
		})
		fetchBundleSize(name).then(setBundleSize)
	}, [name])

	useEffect(() => {
		const el = cardRef.current
		if (!el) return

		const start = () => iconRef.current?.startAnimation()
		const stop = () => iconRef.current?.stopAnimation()

		el.addEventListener("mouseenter", start)
		el.addEventListener("mouseleave", stop)

		return () => {
			el.removeEventListener("mouseenter", start)
			el.removeEventListener("mouseleave", stop)
		}
	}, [])

	const handleCopy = () => {
		setCopied(true)
		setTimeout(() => setCopied(false), 2000)

		if (navigator.clipboard) {
			navigator.clipboard.writeText(activeCmd).catch(() => {})
		} else {
			// Clipboard API unavailable (non-secure context) — use legacy fallback
			console.warn('navigator.clipboard unavailable — page is not in a secure context (HTTPS or localhost)')
			const textarea = document.createElement('textarea')
			textarea.value = activeCmd
			textarea.style.position = 'fixed'
			textarea.style.opacity = '0'
			document.body.appendChild(textarea)
			textarea.select()
			document.execCommand('copy')
			document.body.removeChild(textarea)
		}
	}

	return (
		<div ref={cardRef} className="not-prose relative w-full">
			<ExaShape
				slope={24}
				accentLineWidth={2}
				accentColor="var(--exa-gold-border)"
				highlight={false}
				innerBorderWidth={1}
			>
				{/* Decorative diagonal line pattern */}
				<div
					className="absolute inset-0 opacity-[0.03] pointer-events-none"
					style={{
						backgroundImage: `repeating-linear-gradient(135deg, currentColor 0px, currentColor 1px, transparent 1px, transparent 12px)`,
					}}
				/>

				<div className="relative flex flex-col gap-5 p-6 md:p-8">
					{/* Top section: icon + content */}
					<div className="flex flex-col md:flex-row items-center md:items-start gap-5">
						{/* Icon */}
						{icon && (
							<div className="shrink-0 text-muted-foreground [&_svg]:size-16 md:[&_svg]:size-20">
								{isValidElement(icon)
									? cloneElement(icon as React.ReactElement<{ ref?: React.Ref<unknown> }>, { ref: iconRef })
									: icon}
							</div>
						)}

						{/* Content */}
						<div className="flex flex-col items-center md:items-start gap-3 flex-1 min-w-0">
							<h1 className="text-xl md:text-2xl font-bold tracking-tight">{name}</h1>
							<p className="text-sm text-muted-foreground text-center md:text-left">{description}</p>

							{/* Metadata strip: license + sizes + platforms + deprecation */}
							<div className="flex flex-wrap items-center gap-2">
								<Badge variant="secondary">MIT</Badge>
								<a
									href={`https://packagephobia.com/result?p=${encodeURIComponent(name)}`}
									target="_blank"
									rel="noopener noreferrer"
									title="Package size (unpacked)"
								>
									<Badge variant="secondary">{unpackedSize != null ? formatBytes(unpackedSize) : "..."} Package Size</Badge>
								</a>
								<a
									href={`https://bundlephobia.com/package/${encodeURIComponent(name)}`}
									target="_blank"
									rel="noopener noreferrer"
									title="Minified + gzipped bundle size"
								>
									<Badge variant="secondary">{bundleSize ? formatBytes(bundleSize.gzip) : "..."} Bundle Size</Badge>
								</a>
								{platforms && platforms.map((p) => (
									<Badge key={p} variant="secondary" className="gap-1">
										{platformIcons[p]}
										{platformLabels[p]}
									</Badge>
								))}
								{deprecated && <Badge variant="destructive">Deprecated</Badge>}
							</div>

							{/* Install section */}
							<div className="flex flex-col gap-1.5 w-full mt-1">
								<div className="flex items-center justify-between">
									<span className="text-xs text-muted-foreground">
										Install <span className="font-bold text-foreground">{name}</span> with:
									</span>
									<div className="flex items-center gap-0.5">
										<button
											onClick={() => { setPreview(false); setCopied(false) }}
											className={`text-xs px-2 py-0.5 rounded-sm transition-colors cursor-pointer ${!preview ? "text-foreground bg-muted font-medium" : "text-muted-foreground hover:text-foreground"}`}
										>
											{version ? `v${version}` : "Latest"}
										</button>
										<button
											onClick={() => { setPreview(true); setCopied(false) }}
											className={`text-xs px-2 py-0.5 rounded-sm transition-colors cursor-pointer ${preview ? "text-foreground bg-muted font-medium" : "text-muted-foreground hover:text-foreground"}`}
										>
											Preview
										</button>
									</div>
								</div>
								<button
									onClick={handleCopy}
									className={`flex items-center w-full border transition-all duration-200 cursor-pointer min-w-0 ${copied ? "border-green-500/50 bg-green-500/10" : "border-border bg-muted/50 hover:bg-muted"}`}
								>
									<span className={`flex-1 text-left px-3 py-2 text-sm font-mono truncate transition-colors duration-200 ${copied ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
										{copied ? "Copied to clipboard!" : activeCmd}
									</span>
									<span className={`shrink-0 px-3 py-2 border-l transition-colors duration-200 ${copied ? "border-green-500/50 text-green-600 dark:text-green-400" : "border-border text-muted-foreground hover:text-foreground"}`}>
										{copied ? <CheckIcon /> : <CopyIcon />}
									</span>
								</button>
							</div>

							{/* Works with collapsible */}
							{allCompat.length > 0 && (
								<div className="w-full">
									<button
										onClick={() => setCompatOpen((o) => !o)}
										className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
									>
										Pairs with {allCompat.length} plugin{allCompat.length !== 1 ? "s" : ""}
										<ChevronIcon open={compatOpen} />
									</button>
									{compatOpen && (
										<div className="mt-2 flex flex-col gap-1.5">
											{allCompat.map((dep) => (
												<a
													key={dep.name}
													href={dep.href}
													className="flex items-center gap-2 no-underline group"
												>
													<span className="text-sm text-foreground group-hover:text-primary transition-colors">
														{dep.name}
													</span>
													<span className="text-[10px] text-muted-foreground/60">{dep.kind}</span>
													{dep.description && (
														<span className="text-xs text-muted-foreground">{dep.description}</span>
													)}
												</a>
											))}
										</div>
									)}
								</div>
							)}
						</div>
					</div>

					{/* Footer: npm + GitHub + Discord links on the right */}
					<div className="flex justify-end items-center gap-3">
						<a href={npmUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground transition-colors">
							<NpmIcon size={16} />
						</a>
						{github && (
							<a href={github} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground transition-colors">
								<GitHubIcon size={16} />
							</a>
						)}
						<a href="https://robojs.dev/discord" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground transition-colors">
							<DiscordIcon size={16} />
						</a>
					</div>
				</div>
			</ExaShape>
		</div>
	)
}
