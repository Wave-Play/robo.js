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
	placeholderChildNode: RadixNode<T> | null
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

	const params: MatchedRoute['params'] = {}
	let paramsFound = false
	let wildcardNode = null
	let node = ctx.rootNode
	let wildCardParam = null

	for (let i = 0; i < sections.length; i++) {
		const section = sections[i]

		if (node.wildcardChildNode !== null) {
			wildcardNode = node.wildcardChildNode
			wildCardParam = sections.slice(i).join('/')
		}

		// Exact matches take precedence over placeholders
		const nextNode = node.children.get(section)
		if (nextNode !== undefined) {
			node = nextNode
		} else {
			node = node.placeholderChildNode
			if (node !== null) {
				params[node.paramName] = section
				paramsFound = true
			} else {
				break
			}
		}
	}

	if ((node === null || node.data === null) && wildcardNode !== null) {
		node = wildcardNode
		params[node.paramName || '_'] = wildCardParam
		paramsFound = true
	}

	if (!node) {
		return null
	}

	if (paramsFound) {
		return {
			...node.data,
			params: paramsFound ? params : undefined
		}
	}

	return node.data
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
				node.placeholderChildNode = childNode
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
	let success = false
	const sections = path.split('/')
	let node = ctx.rootNode

	for (const section of sections) {
		node = node.children.get(section)
		if (!node) {
			return success
		}
	}

	if (node.data) {
		const lastSection = sections[sections.length - 1]
		node.data = null
		if (Object.keys(node.children).length === 0) {
			const parentNode = node.parent
			parentNode.children.delete(lastSection)
			parentNode.wildcardChildNode = null
			parentNode.placeholderChildNode = null
		}
		success = true
	}

	return success
}

function createRadixNode(options: Partial<RadixNode> = {}): RadixNode {
	return {
		type: options.type || NODE_TYPES.NORMAL,
		parent: options.parent || null,
		children: new Map(),
		data: options.data || null,
		paramName: options.paramName || null,
		wildcardChildNode: null,
		placeholderChildNode: null
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
