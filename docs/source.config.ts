import { remarkInstall } from "fumadocs-docgen"
import { defineCollections, defineConfig, defineDocs, frontmatterSchema } from "fumadocs-mdx/config"
import remarkReleaseTag from "./src/lib/remark-release-tag"
import { z } from "zod"

export const docs = defineDocs({
  dir: "content/docs",
})

export const blog = defineCollections({
  type: "doc",
  dir: "content/blog",
  schema: frontmatterSchema.extend({
    author: z.string(),
    date: z.string().date().or(z.date()).optional(),
  }),
})

const directorySchema = frontmatterSchema.extend({
  author: z.string(),
  sourceType: z.enum(["official", "community"]),
  itemType: z.enum(["plugin", "template"]),
  date: z.string().date().or(z.date()).optional(),
  language: z.array(z.enum(["typescript", "javascript"])),
  type: z.enum(["bot", "web", "activity", "plugin"]),
  image: z.string().optional(),
  stars: z.number().optional(),
})

export const directory = defineCollections({
  type: "doc",
  dir: "content/directory",
  schema: directorySchema,
})

export type DirectoryItem = z.infer<typeof directorySchema>

export default defineConfig({
  mdxOptions: {
    rehypeCodeOptions: {
      inline: "tailing-curly-colon",
      themes: {
        dark: "vitesse-dark",
        light: "vitesse-light",
      },
    },
    remarkPlugins: [remarkReleaseTag, [remarkInstall, { persist: { id: "pkg-add-persist" } }]],
  },
})
