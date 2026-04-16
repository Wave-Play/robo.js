import { visit } from 'unist-util-visit'
import type { Root } from 'mdast'

export default function remarkStripMdxExt() {
	return (tree: Root) => {
		visit(tree, 'link', (node: any) => {
			if (typeof node.url !== 'string') return
			node.url = node.url.replace(/\.mdx?(?=$|[?#])/, '')
		})
	}
}
