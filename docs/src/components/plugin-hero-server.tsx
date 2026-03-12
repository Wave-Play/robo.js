import { unstable_cache } from "next/cache"
import { PluginHero } from "./plugin-hero"
import type { PluginHeroProps } from "./plugin-hero"

// unstable_cache only caches successful returns — thrown errors are never cached,
// so failed fetches will be retried on the next request instead of being stuck for an hour.

const fetchNpmData = unstable_cache(
	async (packageName: string) => {
		const res = await fetch(`https://registry.npmjs.org/${packageName}/latest`)
		if (!res.ok) throw new Error(`npm registry returned ${res.status}`)
		const json = await res.json()
		if (!json.version) throw new Error("Missing version in npm response")
		return { version: json.version as string, unpackedSize: json.dist?.unpackedSize as number | undefined }
	},
	["plugin-hero-npm"],
	{ revalidate: 3600 }
)

const fetchBundleSize = unstable_cache(
	async (packageName: string) => {
		const res = await fetch(`https://bundlephobia.com/api/size?package=${encodeURIComponent(packageName)}`)
		if (!res.ok) throw new Error(`bundlephobia returned ${res.status}`)
		const json = await res.json()
		if (json.gzip == null || json.size == null) throw new Error("Missing size data in bundlephobia response")
		return { gzip: json.gzip as number, raw: json.size as number }
	},
	["plugin-hero-bundle"],
	{ revalidate: 3600 }
)

export async function PluginHeroServer(props: PluginHeroProps) {
	const [npmResult, bundleResult] = await Promise.allSettled([
		fetchNpmData(props.name),
		fetchBundleSize(props.name),
	])

	const npm = npmResult.status === "fulfilled" ? npmResult.value : undefined
	const bundle = bundleResult.status === "fulfilled" ? bundleResult.value : undefined

	return (
		<PluginHero
			{...props}
			initialVersion={npm?.version}
			initialUnpackedSize={npm?.unpackedSize}
			initialBundleSize={bundle}
		/>
	)
}
