/**
 * This was forked from radix3 (MIT License)
 * https://github.com/unjs/radix3
 *
 * It was done to minimize size and remove unnecessary features.
 */
export const NODE_TYPES = {
	NORMAL: 0 as const,
	WILDCARD: 1 as const,
	PLACEHOLDER: 2 as const
}

type _NODE_TYPES = typeof NODE_TYPES
export type NODE_TYPE = _NODE_TYPES[keyof _NODE_TYPES]

type _RadixNodeDataObject = { params?: never; [key: string]: unknown }
export type RadixNodeData<T extends _RadixNodeDataObject = _RadixNodeDataObject> = T
export type MatchedRoute<T extends RadixNodeData = RadixNodeData> = Omit<T, 'params'> & {
	params?: Record<string, unknown>
}

export interface RadixNode<T extends RadixNodeData = RadixNodeData> {
	type: NODE_TYPE
	parent: RadixNode<T> | null
	children: Map<string, RadixNode<T>>
	data: RadixNodeData | null
	paramName: string | null
	wildcardChildNode: RadixNode<T> | null
	placeholderChildren: RadixNode<T>[]
}

export interface RadixRouterOptions {
	strictTrailingSlash?: boolean
	routes?: Record<string, _RadixNodeDataObject>
}

export interface RadixRouterContext<T extends RadixNodeData = RadixNodeData> {
	options: RadixRouterOptions
	rootNode: RadixNode<T>
	staticRoutesMap: Record<string, RadixNode>
}

export interface RadixRouter<T extends RadixNodeData = RadixNodeData> {
	ctx: RadixRouterContext<T>

	/**
	 * Perform lookup of given path in radix tree
	 * @param path - the path to search for
	 *
	 * @returns The data that was originally inserted into the tree
	 */
	lookup(path: string): MatchedRoute<T> | null

	/**
	 * Perform an insert into the radix tree
	 * @param path - the prefix to match
	 * @param data - the associated data to path
	 *
	 */
	insert(path: string, data: T | unknown): void

	/**
	 * Perform a remove on the tree
	 * @param { string } data.path - the route to match
	 *
	 * @returns A boolean signifying if the remove was successful or not
	 */
	remove(path: string): boolean
}

export function createRouter<T extends RadixNodeData = RadixNodeData>(
	options: RadixRouterOptions = {}
): RadixRouter<T> {
	const ctx: RadixRouterContext = {
		options,
		rootNode: createRadixNode(),
		staticRoutesMap: {}
	}

	const normalizeTrailingSlash = (p: string) => (options.strictTrailingSlash ? p : p.replace(/\/$/, '') || '/')

	if (options.routes) {
		for (const path in options.routes) {
			insert(ctx, normalizeTrailingSlash(path), options.routes[path])
		}
	}

	return {
		ctx,
		// @ts-expect-error - this is fine
		lookup: (path: string) => lookup(ctx, normalizeTrailingSlash(path)),
		insert: (path: string, data: unknown) => insert(ctx, normalizeTrailingSlash(path), data),
		remove: (path: string) => remove(ctx, normalizeTrailingSlash(path))
	}
}

function lookup(ctx: RadixRouterContext, path: string): MatchedRoute {
	const staticPathNode = ctx.staticRoutesMap[path]
	if (staticPathNode) {
		return staticPathNode.data
	}

	const sections = path.split('/')
	return lookupRecursive(ctx.rootNode, sections, 0, {})
}

function lookupRecursive(
	node: RadixNode,
	sections: string[],
	index: number,
	params: Record<string, unknown>
): MatchedRoute | null {
	// Base case: consumed all sections
	if (index >= sections.length) {
		if (node.data !== null) {
			return Object.keys(params).length > 0 ? { ...node.data, params } : node.data
		}
		return null
	}

	const section = sections[index]

	// Priority 1: Exact match
	const exactChild = node.children.get(section)
	if (exactChild !== undefined) {
		const result = lookupRecursive(exactChild, sections, index + 1, params)
		if (result !== null) return result
	}

	// Priority 2: Try each placeholder child
	for (const placeholderChild of node.placeholderChildren) {
		const newParams = { ...params, [placeholderChild.paramName]: section }
		const result = lookupRecursive(placeholderChild, sections, index + 1, newParams)
		if (result !== null) return result
	}

	// Priority 3: Wildcard (captures rest of path)
	if (node.wildcardChildNode !== null) {
		const wildcard = node.wildcardChildNode
		const wildcardValue = sections.slice(index).join('/')
		return {
			...wildcard.data,
			params: { ...params, [wildcard.paramName || '_']: wildcardValue }
		}
	}

	return null
}

function insert(ctx: RadixRouterContext, path: string, data: unknown) {
	let isStaticRoute = true

	const sections = path.split('/')

	let node = ctx.rootNode

	let _unnamedPlaceholderCtr = 0

	for (const section of sections) {
		let childNode: RadixNode<RadixNodeData>

		if ((childNode = node.children.get(section))) {
			node = childNode
		} else {
			const type = getNodeType(section)

			// Create new node to represent the next part of the path
			childNode = createRadixNode({ type, parent: node })

			node.children.set(section, childNode)

			if (type === NODE_TYPES.PLACEHOLDER) {
				childNode.paramName = section === '*' ? `_${_unnamedPlaceholderCtr++}` : section.slice(1)
				node.placeholderChildren.push(childNode)
				isStaticRoute = false
			} else if (type === NODE_TYPES.WILDCARD) {
				node.wildcardChildNode = childNode
				childNode.paramName = section.slice(3 /* "**:" */) || '_'
				isStaticRoute = false
			}

			node = childNode
		}
	}

	// Store whatever data was provided into the node
	node.data = data as _RadixNodeDataObject

	// Optimization, if a route is static and does not have any
	// variable sections, we can store it into a map for faster retrievals
	if (isStaticRoute === true) {
		ctx.staticRoutesMap[path] = node
	}

	return node
}

function remove(ctx: RadixRouterContext, path: string) {
	const sections = path.split('/')
	let node = ctx.rootNode

	for (const section of sections) {
		node = node.children.get(section)
		if (!node) {
			return false
		}
	}

	if (!node.data) {
		return false
	}

	delete ctx.staticRoutesMap[path]
	node.data = null

	let currentNode: RadixNode | null = node
	let sectionIndex = sections.length - 1

	while (currentNode && currentNode.parent && shouldPruneNode(currentNode)) {
		const parentNode = currentNode.parent
		const section = sections[sectionIndex]

		if (parentNode.children.get(section) === currentNode) {
			parentNode.children.delete(section)
		}
		if (parentNode.wildcardChildNode === currentNode) {
			parentNode.wildcardChildNode = null
		}

		const placeholderIndex = parentNode.placeholderChildren.indexOf(currentNode)
		if (placeholderIndex !== -1) {
			parentNode.placeholderChildren.splice(placeholderIndex, 1)
		}

		currentNode = parentNode
		sectionIndex--
	}

	return true
}

function shouldPruneNode(node: RadixNode): boolean {
	return (
		node.data === null &&
		node.children.size === 0 &&
		node.wildcardChildNode === null &&
		node.placeholderChildren.length === 0
	)
}

function createRadixNode(options: Partial<RadixNode> = {}): RadixNode {
	return {
		type: options.type || NODE_TYPES.NORMAL,
		parent: options.parent || null,
		children: new Map(),
		data: options.data || null,
		paramName: options.paramName || null,
		wildcardChildNode: null,
		placeholderChildren: []
	}
}

function getNodeType(str: string) {
	if (str.startsWith('**')) {
		return NODE_TYPES.WILDCARD
	}
	if (str[0] === ':' || str === '*') {
		return NODE_TYPES.PLACEHOLDER
	}
	return NODE_TYPES.NORMAL
}
