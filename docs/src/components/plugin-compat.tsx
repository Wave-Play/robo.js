"use client"

import * as React from "react"
import { Badge } from "./ui/badge"

interface PluginCompatProps {
	roboVersion?: string
	platforms?: ("Bots" | "Activities" | "Web")[]
	requires?: { name: string; href: string }[]
	optional?: { name: string; href: string }[]
}

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

const GlobeIcon = () => (
	<svg xmlns="http://www.w3.org/2000/svg" width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter">
		<circle cx="12" cy="12" r="10" />
		<path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
		<path d="M2 12h20" />
	</svg>
)

const CheckIcon = () => (
	<svg xmlns="http://www.w3.org/2000/svg" width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter">
		<path d="M20 6 9 17l-5-5" />
	</svg>
)

const platformIcons: Record<string, React.ReactNode> = {
	Bots: <BotIcon />,
	Activities: <GamepadIcon />,
	Web: <GlobeIcon />,
}

const platformLabels: Record<string, string> = {
	Bots: "Discord Bots",
	Activities: "Discord Activities",
	Web: "Web",
}

export function PluginCompat({ roboVersion, platforms, requires, optional }: PluginCompatProps) {
	const hasAny = roboVersion || platforms || requires || optional

	return (
		<div className="not-prose flex flex-col sm:flex-row sm:flex-wrap gap-4 border border-border bg-card/50 px-4 py-3 text-sm">
			{!hasAny && (
				<div className="flex items-center gap-2 text-muted-foreground">
					<CheckIcon />
					<span>Works with all Robo.js projects</span>
				</div>
			)}

			{roboVersion && (
				<div className="flex items-center gap-2">
					<span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Version</span>
					<Badge variant="outline">{roboVersion}</Badge>
				</div>
			)}

			{platforms && platforms.length > 0 && (
				<div className="flex items-center gap-2">
					<span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Platforms</span>
					<div className="flex gap-1.5">
						{platforms.map((p) => (
							<Badge key={p} variant="secondary" className="gap-1">
								{platformIcons[p]}
								{platformLabels[p]}
							</Badge>
						))}
					</div>
				</div>
			)}

			{requires && requires.length > 0 && (
				<div className="flex items-center gap-2">
					<span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Requires</span>
					<div className="flex gap-1.5">
						{requires.map((dep) => (
							<a key={dep.name} href={dep.href} className="no-underline">
								<Badge variant="default">{dep.name}</Badge>
							</a>
						))}
					</div>
				</div>
			)}

			{optional && optional.length > 0 && (
				<div className="flex items-center gap-2">
					<span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Optional</span>
					<div className="flex gap-1.5">
						{optional.map((dep) => (
							<a key={dep.name} href={dep.href} className="no-underline">
								<Badge variant="secondary">{dep.name}</Badge>
							</a>
						))}
					</div>
				</div>
			)}
		</div>
	)
}
