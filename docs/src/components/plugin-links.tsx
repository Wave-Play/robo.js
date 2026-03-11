"use client"

import * as React from "react"
import Link from "next/link"
import { ExaShape } from "./ui/exa-shape"
import { ExaGrow } from "./ui/exa-grow"

interface RelatedPlugin {
	name: string
	href: string
	description: string
	icon?: React.ReactNode
}

interface PluginLinksProps {
	name: string
	github?: string
	related?: RelatedPlugin[]
}

const ExternalLinkIcon = () => (
	<svg xmlns="http://www.w3.org/2000/svg" width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter">
		<path d="M15 3h6v6" />
		<path d="M10 14 21 3" />
		<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
	</svg>
)

const NpmIcon = () => (
	<svg xmlns="http://www.w3.org/2000/svg" width={14} height={14} viewBox="0 0 24 24" fill="currentColor">
		<path d="M1.763 0C.786 0 0 .786 0 1.763v20.474C0 23.214.786 24 1.763 24h20.474c.977 0 1.763-.786 1.763-1.763V1.763C24 .786 23.214 0 22.237 0zM5.13 5.323h13.837v13.548h-3.464V8.691h-3.366v10.18H5.13z" />
	</svg>
)

const GitHubIcon = () => (
	<svg xmlns="http://www.w3.org/2000/svg" width={14} height={14} viewBox="0 0 24 24" fill="currentColor">
		<path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
	</svg>
)

const FileTextIcon = () => (
	<svg xmlns="http://www.w3.org/2000/svg" width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter">
		<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
		<path d="M14 2v4a2 2 0 0 0 2 2h4" />
		<path d="M10 13H8" />
		<path d="M16 17H8" />
		<path d="M16 13h-2" />
	</svg>
)

function computeGitHubUrl(name: string): string {
	// @robojs/ai -> packages/plugin-ai
	// @robojs/server -> packages/plugin-api (special case)
	// @robojs/cron -> packages/@robojs/cron
	const stripped = name.replace("@robojs/", "")

	// Known mappings for packages that don't follow simple convention
	const knownMappings: Record<string, string> = {
		ai: "plugin-ai",
		server: "plugin-api",
		sync: "plugin-sync",
		dev: "plugin-devtools",
		moderation: "plugin-modtools",
		analytics: "@robojs/analytics",
		auth: "@robojs/auth",
		cron: "@robojs/cron",
		i18n: "@robojs/i18n",
		patch: "@robojs/patch",
		trpc: "@robojs/trpc",
		"better-stack": "plugin-better-stack",
	}

	const packagePath = knownMappings[stripped] ?? stripped
	return `https://github.com/Wave-Play/robo.js/tree/main/packages/${packagePath}`
}

export function PluginLinks({ name, github, related }: PluginLinksProps) {
	const githubUrl = github ?? computeGitHubUrl(name)
	const npmUrl = `https://www.npmjs.com/package/${name}`

	return (
		<div className="not-prose relative w-full">
			<ExaShape slope={24} highlight={false} innerBorderWidth={1}>
				<div className="p-6 md:p-8">
					{/* Links section */}
					<div className="flex flex-col gap-3">
						<span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Links</span>
						<div className="flex flex-wrap gap-4">
							<a
								href={npmUrl}
								target="_blank"
								rel="noopener noreferrer"
								className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
							>
								<NpmIcon /> npm <ExternalLinkIcon />
							</a>
							<a
								href={githubUrl}
								target="_blank"
								rel="noopener noreferrer"
								className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
							>
								<GitHubIcon /> Source <ExternalLinkIcon />
							</a>
							<a
								href={`${githubUrl}/blob/main/CHANGELOG.md`}
								target="_blank"
								rel="noopener noreferrer"
								className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
							>
								<FileTextIcon /> Changelog <ExternalLinkIcon />
							</a>
						</div>
					</div>

					{/* Related plugins */}
					{related && related.length > 0 && (
						<>
							<div className="my-6 border-t border-border" />
							<div className="flex flex-col gap-3">
								<span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Works great with</span>
								<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
									{related.map((plugin) => {
										const isExternal = plugin.href.startsWith("http")
										const card = (
											<ExaGrow key={plugin.name} scale={1.02}>
												<div className="relative w-full">
													<ExaShape highlight slope={12} innerBorderWidth={1}>
														<div className="flex items-start gap-3 p-4">
															{plugin.icon && (
																<div className="shrink-0 text-muted-foreground [&_svg]:size-5 mt-0.5">
																	{plugin.icon}
																</div>
															)}
															<div className="min-w-0">
																<h4 className="text-sm font-medium">{plugin.name}</h4>
																<p className="text-xs text-muted-foreground mt-1 leading-snug">{plugin.description}</p>
															</div>
														</div>
													</ExaShape>
												</div>
											</ExaGrow>
										)

										if (isExternal) {
											return (
												<a key={plugin.name} href={plugin.href} target="_blank" rel="noopener noreferrer" className="block no-underline">
													{card}
												</a>
											)
										}

										return (
											<Link key={plugin.name} href={plugin.href} className="block no-underline">
												{card}
											</Link>
										)
									})}
								</div>
							</div>
						</>
					)}
				</div>
			</ExaShape>
		</div>
	)
}
