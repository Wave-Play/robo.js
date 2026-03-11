'use client'

import type * as PageTree from 'fumadocs-core/page-tree'
import type { FC, ReactNode } from 'react'
import NextLink from 'next/link'
import { usePathname } from 'next/navigation'
import { useTreePath } from 'fumadocs-ui/contexts/tree'
import {
	SidebarFolder,
	SidebarFolderContent,
	useFolder,
	useFolderDepth,
	useSidebar,
} from 'fumadocs-ui/components/sidebar/base'
import { cn } from 'fumadocs-ui/utils/cn'
import { isActive } from 'fumadocs-ui/utils/is-active'
import { ChevronDown } from 'fumadocs-ui/internal/icons'

function getItemOffset(depth: number) {
	return `calc(${2 + 3 * depth} * var(--spacing))`
}

function getFirstChildUrl(item: PageTree.Folder): string | undefined {
	if (item.index) return item.index.url
	for (const child of item.children) {
		if (child.type === 'page') return child.url
		if (child.type === 'folder') {
			const url = getFirstChildUrl(child)
			if (url) return url
		}
	}
}

function FolderRow({ item }: { item: PageTree.Folder }) {
	const folder = useFolder()
	const depth = useFolderDepth()
	const { prefetch } = useSidebar()
	const pathname = usePathname()

	const href = getFirstChildUrl(item)
	const active = href !== undefined && isActive(href, pathname, false)
	const collapsible = folder?.collapsible ?? true

	return (
		<div className="flex w-full items-center">
			<NextLink
				href={href ?? '#'}
				data-active={active}
				prefetch={prefetch}
				style={{ paddingInlineStart: getItemOffset(depth - 1) }}
				className={cn(
					'relative flex flex-1 min-w-0 flex-row items-center gap-2 rounded-lg p-2 text-start text-fd-muted-foreground wrap-anywhere [&_svg]:size-4 [&_svg]:shrink-0',
					'transition-colors hover:bg-fd-accent/50 hover:text-fd-accent-foreground/80 hover:transition-none',
					'data-[active=true]:bg-fd-primary/10 data-[active=true]:text-fd-primary data-[active=true]:hover:transition-colors',
					depth > 1 &&
						"data-[active=true]:before:content-[''] data-[active=true]:before:bg-fd-primary data-[active=true]:before:absolute data-[active=true]:before:w-px data-[active=true]:before:inset-y-2.5 data-[active=true]:before:start-2.5"
				)}
			>
				{item.icon}
				{item.name}
			</NextLink>
			{collapsible && (
				<button
					type="button"
					aria-label={folder?.open ? 'Collapse section' : 'Expand section'}
					onClick={() => folder?.setOpen((prev) => !prev)}
					className={cn(
						'flex shrink-0 items-center justify-center rounded-lg',
						'min-h-[40px] min-w-[40px]',
						'transition-colors hover:bg-fd-accent/50 hover:text-fd-accent-foreground/80 hover:transition-none',
						'text-fd-muted-foreground'
					)}
				>
					<ChevronDown
						data-icon
						className={cn('transition-transform', !folder?.open && '-rotate-90')}
					/>
				</button>
			)}
		</div>
	)
}

function StyledFolderContent({ children }: { children: ReactNode }) {
	const depth = useFolderDepth()

	return (
		<SidebarFolderContent
			className={cn(
				'relative',
				depth === 1 &&
					"before:content-[''] before:absolute before:w-px before:inset-y-1 before:bg-fd-border before:start-2.5"
			)}
		>
			{children}
		</SidebarFolderContent>
	)
}

export const CustomSidebarFolder: FC<{
	item: PageTree.Folder
	children: ReactNode
}> = ({ item, children }) => {
	const path = useTreePath()

	return (
		<SidebarFolder collapsible={item.collapsible} active={path.includes(item)} defaultOpen={item.defaultOpen}>
			<FolderRow item={item} />
			<StyledFolderContent>{children}</StyledFolderContent>
		</SidebarFolder>
	)
}
