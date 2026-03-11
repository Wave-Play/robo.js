import { createMDX } from "fumadocs-mdx/next"

const withMDX = createMDX()

/** @type {import('next').NextConfig} */
const config = {
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
