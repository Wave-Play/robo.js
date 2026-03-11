import { createRelativeLink } from "fumadocs-ui/mdx"
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/page"
import { notFound } from "next/navigation"
import { Children, type ComponentPropsWithoutRef } from "react"
import { source } from "@/lib/source"
import { getMDXComponents } from "@/mdx-components"
import { DocsPageFooter } from "@/components/docs-page-footer"
import { TocPopover } from "@/components/toc-popover"

export default async function Page(props: { params: Promise<{ slug?: string[] }> }) {
  const params = await props.params
  const page = source.getPage(params.slug)
  if (!page) notFound()

  const MDXContent = page.data.body
  const BaseLink = createRelativeLink(source, page)

  // Wraps children with stable keys to prevent React key warnings from Next.js Link
  const a = async ({ children, ...rest }: ComponentPropsWithoutRef<"a">) => {
    return BaseLink({ ...rest, children: Children.toArray(children) })
  }

  return (
    <DocsPage
      toc={page.data.toc}
      full={page.data.full}
      tableOfContent={{ style: "clerk" }}
      tableOfContentPopover={{ component: <TocPopover /> }}
      footer={{ component: <DocsPageFooter /> }}
    >
      {page.data.title !== "README" && (
        <>
          <DocsTitle>{page.data.title}</DocsTitle>
          <DocsDescription>{page.data.description}</DocsDescription>
        </>
      )}
      <DocsBody>
        <MDXContent components={getMDXComponents({ a })} />
      </DocsBody>
    </DocsPage>
  )
}

export async function generateStaticParams() {
  return source.generateParams()
}

export async function generateMetadata(props: { params: Promise<{ slug?: string[] }> }) {
  const params = await props.params
  const page = source.getPage(params.slug)
  if (!page) notFound()

  return {
    title: page.data.title,
    description: page.data.description,
  }
}
