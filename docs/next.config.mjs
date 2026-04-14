import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createMDX } from "fumadocs-mdx/next"

const withMDX = createMDX()
const monorepoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** @type {import('next').NextConfig} */
const config = {
  output: 'standalone',
  outputFileTracingRoot: monorepoRoot,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'robojs.dev',
      },
    ],
  },
  reactStrictMode: true,
}

export default withMDX(config)
