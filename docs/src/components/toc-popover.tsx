"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "fumadocs-ui/utils/cn"
import { useTOCItems, TOCScrollArea } from "fumadocs-ui/components/toc/index"
import { TOCItems } from "fumadocs-ui/components/toc/clerk"
import type { TOCItemType } from "fumadocs-core/toc"
import { useTreePath } from "fumadocs-ui/contexts/tree"
import { useI18n } from "fumadocs-ui/contexts/i18n"
import {
	Collapsible,
	CollapsibleTrigger,
	CollapsibleContent,
} from "fumadocs-ui/components/ui/collapsible"

/* ------------------------------------------------------------------ */
/*  Polygon progress indicator                                        */
/* ------------------------------------------------------------------ */

function round4(n: number): number {
	return Math.round(n * 1e4) / 1e4
}

function buildPolygonPath(sides: number, cx: number, cy: number, r: number): string {
	const parts: string[] = []
	for (let i = 0; i < sides; i++) {
		const angle = (2 * Math.PI * i) / sides - Math.PI / 2
		const x = round4(cx + r * Math.cos(angle))
		const y = round4(cy + r * Math.sin(angle))
		parts.push(i === 0 ? `M${x},${y}` : `L${x},${y}`)
	}
	parts.push("Z")
	return parts.join(" ")
}

function ProgressPolygon({
	value,
	sides,
	strokeWidth = 2,
	size = 24,
	...rest
}: {
	value: number
	sides: number
	strokeWidth?: number
	size?: number
} & React.SVGProps<SVGSVGElement>) {
	const clamped = Math.min(Math.max(value, 0), 1)
	const n = Math.max(sides, 3)
	const r = (size - strokeWidth) / 2
	const cx = size / 2
	const cy = size / 2
	const d = buildPolygonPath(n, cx, cy, r)
	const perimeter = round4(2 * n * r * Math.sin(Math.PI / n))
	const progress = clamped * perimeter

	return (
		<svg
			role="progressbar"
			viewBox={`0 0 ${size} ${size}`}
			width={size}
			height={size}
			{...rest}
		>
			{/* Background shape */}
			<path
				d={d}
				fill="none"
				stroke="currentColor"
				strokeWidth={strokeWidth}
				strokeLinejoin="miter"
				opacity={0.25}
			/>
			{/* Progress fill */}
			<path
				d={d}
				fill="none"
				stroke="currentColor"
				strokeWidth={strokeWidth}
				strokeLinejoin="miter"
				strokeDasharray={perimeter}
				strokeDashoffset={perimeter - progress}
				className="transition-all"
			/>
		</svg>
	)
}

/* ------------------------------------------------------------------ */
/*  Scroll-based active heading tracker                               */
/* ------------------------------------------------------------------ */

function useActiveHeading(items: TOCItemType[]): number {
	const [index, setIndex] = useState(-1)

	useEffect(() => {
		if (items.length === 0) return

		const ids = items.map((item) => item.url.slice(1))

		function update() {
			const atBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 50
			if (atBottom) {
				setIndex(ids.length - 1)
				return
			}

			let active = -1
			for (let i = 0; i < ids.length; i++) {
				const el = document.getElementById(ids[i])
				if (el && el.getBoundingClientRect().top <= 100) {
					active = i
				}
			}
			setIndex(active)
		}

		update()
		window.addEventListener("scroll", update, { passive: true })
		return () => window.removeEventListener("scroll", update)
	}, [items])

	return index
}

/* ------------------------------------------------------------------ */
/*  Custom TOC popover (replaces the default circle-based one)        */
/* ------------------------------------------------------------------ */

export function TocPopover() {
	const ref = useRef<HTMLDivElement>(null)
	const [open, setOpen] = useState(false)
	const { text } = useI18n()
	const items = useTOCItems()
	const selected = useActiveHeading(items)

	const path = useTreePath().at(-1)
	const showItem = selected !== -1 && !open
	const sides = 6
	const value = (selected + 1) / Math.max(1, items.length)

	// Close when clicking outside
	useEffect(() => {
		function onClick(e: MouseEvent) {
			if (!open) return
			if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
		}
		window.addEventListener("click", onClick)
		return () => window.removeEventListener("click", onClick)
	}, [open])

	return (
		<Collapsible
			open={open}
			onOpenChange={setOpen}
			data-toc-popover=""
			className="sticky top-(--fd-docs-row-2) z-10 [grid-area:toc-popover] h-(--fd-toc-popover-height) xl:hidden max-xl:layout:[--fd-toc-popover-height:--spacing(10)]"
		>
			<header
				ref={ref}
				className={cn(
					"border-b backdrop-blur-sm transition-colors bg-fd-background/80",
					open && "shadow-lg"
				)}
			>
				<CollapsibleTrigger
					className="flex w-full h-10 items-center text-sm text-fd-muted-foreground gap-2.5 px-4 py-2.5 text-start focus-visible:outline-none [&_svg]:size-4 md:px-6"
					data-toc-popover-trigger=""
				>
					<ProgressPolygon
						value={value}
						sides={sides}
						className={cn("shrink-0", open && "text-fd-primary")}
					/>
					<span className="grid flex-1 *:my-auto *:row-start-1 *:col-start-1">
						<span
							className={cn(
								"truncate transition-all",
								open && "text-fd-foreground",
								showItem && "opacity-0 -translate-y-full pointer-events-none"
							)}
						>
							{path?.name ?? text.toc}
						</span>
						<span
							className={cn(
								"truncate transition-all",
								!showItem && "opacity-0 translate-y-full pointer-events-none"
							)}
						>
							{items[selected]?.title}
						</span>
					</span>
					<svg
						className={cn(
							"shrink-0 transition-transform mx-0.5",
							open && "rotate-180"
						)}
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<path d="m6 9 6 6 6-6" />
					</svg>
				</CollapsibleTrigger>
				<CollapsibleContent
					data-toc-popover-content=""
					className="flex flex-col px-4 max-h-[50vh] md:px-6"
				>
					<TOCScrollArea>
						<TOCItems />
					</TOCScrollArea>
				</CollapsibleContent>
			</header>
		</Collapsible>
	)
}
