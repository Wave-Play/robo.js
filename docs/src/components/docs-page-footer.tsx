"use client"

import type * as PageTree from "fumadocs-core/page-tree"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useMemo } from "react"
import { useFooterItems } from "fumadocs-ui/utils/use-footer-items"
import { isActive } from "fumadocs-ui/utils/is-active"
import { cn } from "fumadocs-ui/utils/cn"

const columns = [
	{
		heading: "Resources",
		links: [
			{ title: "Documentation", href: "/docs" },
			{ title: "Blog", href: "https://dev.to/waveplay", external: true },
			{ title: "Templates", href: "/docs/templates" },
		],
	},
	{
		heading: "Ecosystem",
		links: [
			{ title: "Plugins", href: "/plugins" },
			{ title: "RoboPlay", href: "https://roboplay.dev", external: true },
			{ title: "npm", href: "https://www.npmjs.com/package/robo.js", external: true },
		],
	},
	{
		heading: "Community",
		links: [
			{ title: "Discord", href: "https://robojs.dev/discord", external: true },
			{ title: "GitHub", href: "https://github.com/Wave-Play/robo.js", external: true },
			{ title: "Twitter", href: "https://twitter.com/AiWavePlay", external: true },
		],
	},
]

export function DocsPageFooter() {
	const footerList = useFooterItems()
	const pathname = usePathname()

	const { previous, next } = useMemo(() => {
		const idx = footerList.findIndex((item) => isActive(item.url, pathname, false))
		if (idx === -1) return {}
		return { previous: footerList[idx - 1], next: footerList[idx + 1] }
	}, [footerList, pathname])

	return (
		<>
			{/* Prev / Next navigation */}
			{(previous || next) && (
				<div className={cn("@container grid gap-4", previous && next ? "grid-cols-2" : "grid-cols-1")}>
					{previous && <NavItem item={previous} direction="previous" />}
					{next && <NavItem item={next} direction="next" />}
				</div>
			)}

			{/* Site footer */}
			<footer className="border-t border-fd-border pt-8 mt-4">
				<div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
					{columns.map((col) => (
						<div key={col.heading}>
							<p className="mb-3 text-sm font-medium text-fd-foreground">{col.heading}</p>
							<ul className="space-y-2">
								{col.links.map((link) => (
									<li key={link.href}>
										{link.external ? (
											<a
												href={link.href}
												target="_blank"
												rel="noopener noreferrer"
												className="text-sm text-fd-muted-foreground transition-colors hover:text-fd-foreground"
											>
												{link.title}
											</a>
										) : (
											<Link
												href={link.href}
												className="text-sm text-fd-muted-foreground transition-colors hover:text-fd-foreground"
											>
												{link.title}
											</Link>
										)}
									</li>
								))}
							</ul>
						</div>
					))}
				</div>
				<div className="mt-8 border-t border-fd-border pt-4 pb-2">
					<p className="text-xs text-fd-muted-foreground">
						&copy; {new Date().getFullYear()} WavePlay, LLC. All rights reserved.
					</p>
				</div>
			</footer>
		</>
	)
}

function NavItem({ item, direction }: { item: PageTree.Item; direction: "previous" | "next" }) {
	const isPrev = direction === "previous"

	return (
		<Link
			href={item.url}
			className={cn(
				"flex flex-col gap-2 rounded-lg border p-4 text-sm transition-colors hover:bg-fd-accent/80 hover:text-fd-accent-foreground @max-lg:col-span-full",
				!isPrev && "text-end"
			)}
		>
			<div className={cn("inline-flex items-center gap-1.5 font-medium", !isPrev && "flex-row-reverse")}>
				<svg className={cn("size-4 shrink-0", !isPrev && "rotate-180")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
					<path d="m15 18-6-6 6-6" />
				</svg>
				<p>{item.name}</p>
			</div>
			<p className="text-fd-muted-foreground truncate">
				{item.description ?? (isPrev ? "Previous" : "Next")}
			</p>
		</Link>
	)
}
