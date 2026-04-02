'use client'

import type * as PageTree from 'fumadocs-core/page-tree'
import type { ReactNode } from 'react'
import { getSidebarTabs, type SidebarTab } from 'fumadocs-ui/utils/get-sidebar-tabs'
import { Popover, PopoverContent, PopoverTrigger } from 'fumadocs-ui/components/ui/popover'
import { useSidebar } from 'fumadocs-ui/components/sidebar/base'
import { isTabActive } from 'fumadocs-ui/utils/is-active'
import { cn } from 'fumadocs-ui/utils/cn'
import { Check, ChevronsUpDown } from 'fumadocs-ui/internal/icons'
import Link from 'fumadocs-core/link'
import { usePathname } from 'next/navigation'
import { useMemo, useState } from 'react'
import { AnimatedIconWrapper } from '@/components/ui/icons/animated-icon-wrapper'
import { FileText, Connect, Boxes, Milestone } from '@/components/ui/icons'

/**
 * Grouping config for the sidebar dropdown.
 * Tabs whose URL starts with one of the listed prefixes go into that group.
 * Any tab not matching an explicit group falls into "Plugins".
 */
const groups: { label: string; urls: string[] }[] = [
	{ label: 'Apps', urls: ['/docs/bots', '/docs/activities'] },
	{ label: 'Core', urls: ['/docs/framework', '/docs/cli', '/docs/robo-cli', '/docs/ai-native', '/docs/hosting'] },
	{ label: 'Testing', urls: ['/docs/mock'] },
	{ label: 'Ecosystem', urls: [] },
	// "Plugins" is the catch-all — listed here so we can control its position
	{ label: 'Plugins', urls: [] },
	{ label: 'Misc', urls: ['/docs/reference'] },
]

/**
 * External links rendered inside the Misc group with icons and descriptions.
 */
const ecosystemLinks: { title: string; description: string; url: string; icon: ReactNode }[] = [
	{ title: 'Plugins', description: 'Browse the plugin directory', url: '/docs/plugins', icon: <AnimatedIconWrapper><Connect size={20} /></AnimatedIconWrapper> },
	{ title: 'Templates', description: 'Starter kits and examples', url: '/docs/templates', icon: <AnimatedIconWrapper><Boxes size={20} /></AnimatedIconWrapper> },
]

const miscLinks: { title: string; description: string; url: string; icon: ReactNode }[] = [
	{ title: 'Blog', description: 'News, updates, and guides', url: 'https://dev.to/waveplay', icon: <AnimatedIconWrapper><FileText size={20} /></AnimatedIconWrapper> },
	{ title: 'Changelog', description: 'Latest releases and changes', url: '/docs/changelog', icon: <AnimatedIconWrapper><Milestone size={20} /></AnimatedIconWrapper> },
]

function groupTabs(tabs: SidebarTab[]) {
	const explicitPrefixes = groups.flatMap((g) => g.urls)

	return groups
		.map((group) => {
			const matched =
				group.urls.length > 0
					? tabs.filter((t) => group.urls.some((prefix) => t.url.startsWith(prefix)))
					: group.label === 'Plugins'
						? // Catch-all: tabs not claimed by any explicit group
							tabs
								.filter((t) => !explicitPrefixes.some((prefix) => t.url.startsWith(prefix)))
								.sort((a, b) => {
									const titleA = typeof a.title === 'string' ? a.title : a.url
									const titleB = typeof b.title === 'string' ? b.title : b.url
									return titleA.localeCompare(titleB)
								})
						: // Groups with only external links (no page tree tabs)
							[]

			return { label: group.label, tabs: matched }
		})
		.filter((g) => g.tabs.length > 0 || g.label === 'Ecosystem' || g.label === 'Misc')
}

export function SidebarGroupedTabs({ tree }: { tree: PageTree.Root }) {
	const [open, setOpen] = useState(false)
	const { closeOnRedirect } = useSidebar()
	const pathname = usePathname()
	const tabs = useMemo(() => getSidebarTabs(tree), [tree])
	const grouped = useMemo(() => groupTabs(tabs), [tabs])

	const selected = useMemo(() => {
		return tabs.findLast((item) => isTabActive(item, pathname))
	}, [tabs, pathname])

	const onClick = () => {
		closeOnRedirect.current = false
		setOpen(false)
	}

	const trigger = selected ? (
		<>
			<div className="size-9 shrink-0 empty:hidden md:size-5">{selected.icon}</div>
			<div>
				<p className="text-sm font-medium">{selected.title}</p>
				<p className="text-sm text-fd-muted-foreground empty:hidden md:hidden">{selected.description}</p>
			</div>
		</>
	) : (
		<p className="text-sm text-fd-muted-foreground">Select a section</p>
	)

	return (
		<div className="flex flex-col gap-1.5">
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger
					className={cn(
						'flex items-center gap-2 rounded-lg p-2 cursor-pointer',
						'border bg-fd-secondary/50 text-start text-fd-secondary-foreground',
						'transition-all hover:bg-fd-accent hover:scale-[1.04]',
						'data-[state=open]:bg-fd-accent data-[state=open]:text-fd-accent-foreground'
					)}
				>
					{trigger}
					<ChevronsUpDown className="shrink-0 ms-auto size-4 text-fd-muted-foreground" />
				</PopoverTrigger>
				<PopoverContent className="flex flex-col w-(--radix-popover-trigger-width) p-1 fd-scroll-container">
					{grouped.map((group, gi) => (
						<div key={group.label}>
							<p className={cn('text-[0.65rem] font-semibold tracking-wide text-fd-muted-foreground px-2 pb-1 uppercase', gi > 0 ? 'pt-2' : 'pt-1')}>{group.label}</p>
							{group.tabs.map((item) => {
								const active = selected && item.url === selected.url
								if (!active && item.unlisted) return null

								return (
									<Link
										key={item.url}
										href={item.url}
										onClick={onClick}
										className={cn(
											'flex items-center gap-2 rounded-lg p-1.5 text-fd-foreground',
											'transition-colors hover:bg-fd-primary/20'
										)}
									>
										<div className="shrink-0 size-9 md:mt-1 md:mb-auto md:size-5 empty:hidden">
											{item.icon}
										</div>
										<div>
											<p className="text-sm font-medium">{item.title}</p>
											<p className="text-[0.8125rem] text-fd-foreground/60 empty:hidden">
												{item.description}
											</p>
										</div>
										<Check
											className={cn(
												'shrink-0 ms-auto size-3.5 text-fd-primary',
												!active && 'invisible'
											)}
										/>
									</Link>
								)
							})}

							{/* Append external links inside Ecosystem and Misc groups */}
							{group.label === 'Ecosystem' && ecosystemLinks.map((link) => (
								<Link
									key={link.url}
									href={link.url}
									onClick={onClick}
									className={cn(
										'flex items-center gap-2 rounded-lg p-1.5 text-fd-foreground',
										'transition-colors hover:bg-fd-primary/20'
									)}
								>
									<div className="shrink-0 size-9 md:mt-1 md:mb-auto md:size-5 empty:hidden">
										{link.icon}
									</div>
									<div>
										<p className="text-sm font-medium">{link.title}</p>
										<p className="text-[0.8125rem] text-fd-foreground/60">
											{link.description}
										</p>
									</div>
								</Link>
							))}
							{group.label === 'Misc' && miscLinks.map((link) => (
								<Link
									key={link.url}
									href={link.url}
									onClick={onClick}
									className={cn(
										'flex items-center gap-2 rounded-lg p-1.5 text-fd-foreground',
										'transition-colors hover:bg-fd-primary/20'
									)}
								>
									<div className="shrink-0 size-9 md:mt-1 md:mb-auto md:size-5 empty:hidden">
										{link.icon}
									</div>
									<div>
										<p className="text-sm font-medium">{link.title}</p>
										<p className="text-[0.8125rem] text-fd-foreground/60">
											{link.description}
										</p>
									</div>
								</Link>
							))}
						</div>
					))}
				</PopoverContent>
			</Popover>

			{/* Always-visible link back to docs landing */}
			{selected && (
				<Link
					href="/docs"
					className={cn(
						'flex items-center gap-1.5 px-2 py-1',
						'text-xs text-fd-muted-foreground',
						'transition-colors hover:text-fd-foreground'
					)}
				>
					<svg className="shrink-0 size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
						<path d="m15 18-6-6 6-6" />
					</svg>
					Back to Start
				</Link>
			)}
		</div>
	)
}
