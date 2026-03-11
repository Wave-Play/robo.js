import { loader } from "fumadocs-core/source"
import { createElement, type ComponentType } from "react"
import { directory, docs } from "@/.source"
import { toFumadocsSource } from "fumadocs-mdx/runtime/server"
import { AnimatedIconWrapper } from "@/components/ui/icons/animated-icon-wrapper"
import * as icons from "@/components/ui/icons"

// `loader()` also assign a URL to your pages
// See https://fumadocs.vercel.app/docs/headless/source-api for more info
export const source = loader({
  baseUrl: "/docs",
  source: docs.toFumadocsSource(),
  icon(icon) {
    if (!icon) {
      return
    }

    if (icon in icons) {
      const IconComponent = icons[icon as keyof typeof icons] as ComponentType
      return createElement(AnimatedIconWrapper, null, createElement(IconComponent))
    }
  },
})

// directory is a doc collection (array), not a docs collection
// Use standalone toFumadocsSource with empty metas
export const directorySource = loader({
  baseUrl: "/directory",
  source: toFumadocsSource(directory, []),
})
