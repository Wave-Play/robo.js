import type { Code, Root } from "mdast"
import type { Node } from "unist"
import type { Plugin } from "unified"

/**
 * Remark plugin that appends a release tag (e.g. `@next`) to @robojs/* package
 * names and create-robo/create-discord-activity commands in install code blocks.
 *
 * Activated by setting the `NEXT_PUBLIC_RELEASE_CHANNEL` env var (e.g. "next").
 * When unset or empty, the plugin is a no-op.
 */
const remarkReleaseTag: Plugin<[], Root> = () => {
	const channel = process.env.NEXT_PUBLIC_RELEASE_CHANNEL
	if (!channel) return () => {}

	const tag = `@${channel}`

	// Languages that contain install commands
	const installLangs = new Set(["bash", "sh", "package-install", "terminal", ""])

	function visit(node: Node) {
		if (node.type === "code") {
			const code = node as Code
			const lang = (code.lang ?? "").toLowerCase()
			if (!installLangs.has(lang)) return

			// Append tag to @robojs/* packages (avoid double-tagging)
			code.value = code.value.replace(
				/@robojs\/[\w-]+(?![\w@-])/g,
				(match) => `${match}${tag}`
			)

			// Append tag to npx create-robo / create-discord-activity
			code.value = code.value.replace(
				/(?<=npx\s+)(create-robo|create-discord-activity)(?![@\w-])/g,
				(match) => `${match}${tag}`
			)
		}

		if ("children" in node && Array.isArray(node.children)) {
			for (const child of node.children) {
				visit(child)
			}
		}
	}

	return (tree) => {
		visit(tree)
	}
}

export default remarkReleaseTag
