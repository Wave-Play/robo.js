import { Children } from "react"
import { Accordion, Accordions } from "fumadocs-ui/components/accordion"
import { CodeBlock, Pre } from "fumadocs-ui/components/codeblock"
import { File, Files, Folder } from "@/components/files"
import { Step, Steps } from "fumadocs-ui/components/steps"
import { Tab, Tabs } from "fumadocs-ui/components/tabs"
import { TypeTable } from "fumadocs-ui/components/type-table"
import defaultComponents from "fumadocs-ui/mdx"
import type { MDXComponents } from "mdx/types"
import { ReturnType } from "@/components/return-type"
import { Card, Cards } from "@/components/mdx-card"
import { FeatureGrid, Feature } from "@/components/feature-grid"
import { PluginCompat } from "@/components/plugin-compat"
import { PluginHeroServer as PluginHero } from "@/components/plugin-hero-server"
import { PluginLinks } from "@/components/plugin-links"
import { ScreenshotPlaceholder } from "@/components/screenshot-placeholder"
import { StateFlowDiagram } from "@/components/state-flow-diagram"
import * as Icons from "@/components/ui/icons"

const FumadocsLink = defaultComponents.a!

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...Icons,
    ...defaultComponents,
    ...components,
    Tab,
    Tabs,
    File,
    Folder,
    Files,
    Accordion,
    Accordions,
    TypeTable,
    Steps,
    Step,
    ReturnType,
    Card,
    Cards,
    FeatureGrid,
    Feature,
    PluginCompat,
    PluginHero,
    PluginLinks,
    ScreenshotPlaceholder,
    StateFlowDiagram,
    a: ({ children, ...props }) => (
      <FumadocsLink {...props}>{Children.toArray(children)}</FumadocsLink>
    ),
    pre: ({ ref: _ref, children, ...props }) => (
      <CodeBlock keepBackground {...props}>
        <Pre>{children}</Pre>
      </CodeBlock>
    ),
  }
}
