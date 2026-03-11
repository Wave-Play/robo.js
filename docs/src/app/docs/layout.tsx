import { DocsLayout, type DocsLayoutProps } from "fumadocs-ui/layouts/docs"
import { baseOptions, navLinks } from "@/app/layout.config"
import { source } from "@/lib/source"
import { CustomSidebarFolder } from "@/components/sidebar-folder"
import { SidebarGroupedTabs } from "@/components/sidebar-tabs"

// Filter sidebar links to only keep icon-type links (e.g. Discord).
// The "menu" type (Documentation dropdown) is redundant with the section
// dropdown, and "main" links live in the page footer / dropdown quick links.
const sidebarLinks = navLinks.filter((link) => link.type === "icon")

const config = {
  ...baseOptions,
  links: sidebarLinks,
  tree: source.pageTree,
  sidebar: {
    tabs: false,
    defaultOpenLevel: 0,
    banner: <SidebarGroupedTabs tree={source.pageTree} />,
    components: {
      Folder: CustomSidebarFolder,
    },
  },
} satisfies DocsLayoutProps

export default function Layout({ children }: { children: React.ReactNode }): React.ReactNode {
  return <DocsLayout {...config}>{children}</DocsLayout>
}
