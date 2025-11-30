/**
 * Route Type Extraction
 *
 * Extracts Handler and Controller type exports from route files using SWC.
 * Used during build to generate portal type augmentations.
 */

import { parse } from '@swc/core'
import fs from 'node:fs/promises'
import { logger } from '../../core/logger.js'

/**
 * Extracted type information from a route file.
 */
export interface RouteTypes {
	/** Handler type (for data access) */
	handler: TypeExport | null
	/** Controller type (for method access) */
	controller: TypeExport | null
}

/**
 * Information about an exported type.
 */
export interface TypeExport {
	/** The type name (e.g., 'CommandHandler') */
	typeName: string
	/** The import path where this type comes from */
	importPath: string | null
}

/**
 * Extract Handler and Controller type exports from a route file.
 * Returns null for each if not found (e.g., JavaScript project).
 *
 * @param sourceFilePath - Path to the route source file
 * @returns Extracted type information
 */
export async function extractRouteTypes(sourceFilePath: string): Promise<RouteTypes> {
	const result: RouteTypes = { handler: null, controller: null }

	try {
		const source = await fs.readFile(sourceFilePath, 'utf-8')

		// Only parse TypeScript files
		if (!sourceFilePath.endsWith('.ts') && !sourceFilePath.endsWith('.tsx')) {
			return result
		}

		// Parse with SWC (preserves type annotations in AST)
		const ast = await parse(source, {
			syntax: 'typescript',
			tsx: sourceFilePath.endsWith('.tsx')
		})

		// Build import map for resolving type origins
		const importMap = buildImportMap(ast.body)

		// Find: export type Handler = SomeType
		// Find: export type Controller = SomeType
		for (const node of ast.body) {
			if (node.type === 'ExportDeclaration' && node.declaration?.type === 'TsTypeAliasDeclaration') {
				const name = node.declaration.id.value
				const typeAnnotation = node.declaration.typeAnnotation

				if (name === 'Handler' || name === 'Controller') {
					const typeInfo = extractTypeInfo(typeAnnotation, importMap)

					if (name === 'Handler') {
						result.handler = typeInfo
					} else {
						result.controller = typeInfo
					}
				}
			}
		}
	} catch (error) {
		logger.debug(`Failed to extract types from ${sourceFilePath}:`, error)
	}

	return result
}

/**
 * Build a map of imported identifiers to their source paths.
 */
function buildImportMap(nodes: unknown[]): Map<string, string> {
	const importMap = new Map<string, string>()

	for (const node of nodes) {
		if (isImportDeclaration(node)) {
			const sourcePath = node.source.value

			for (const specifier of node.specifiers || []) {
				if (isImportSpecifier(specifier)) {
					const localName = specifier.local.value
					importMap.set(localName, sourcePath)
				} else if (isImportDefaultSpecifier(specifier)) {
					const localName = specifier.local.value
					importMap.set(localName, sourcePath)
				}
			}
		}
	}

	return importMap
}

/**
 * Extract type information from a type annotation.
 */
function extractTypeInfo(typeAnnotation: unknown, importMap: Map<string, string>): TypeExport | null {
	if (!typeAnnotation) {
		return null
	}

	// Handle TsTypeReference (e.g., CommandHandler)
	if (isTsTypeReference(typeAnnotation)) {
		const typeName = getTypeNameFromReference(typeAnnotation)
		if (typeName) {
			const importPath = importMap.get(typeName) ?? null
			return { typeName, importPath }
		}
	}

	// Handle inline types or other patterns
	// For now, return null for complex types
	return null
}

/**
 * Get the type name from a TsTypeReference.
 */
function getTypeNameFromReference(ref: TsTypeReference): string | null {
	const typeName = ref.typeName

	if (isIdentifier(typeName)) {
		return typeName.value
	}

	// Handle qualified names (e.g., Discord.CommandHandler)
	if (isTsQualifiedName(typeName)) {
		// Return the right-most identifier
		return typeName.right.value
	}

	return null
}

// Type guards for SWC AST nodes

interface ImportDeclaration {
	type: 'ImportDeclaration'
	source: { value: string }
	specifiers?: unknown[]
}

interface ImportSpecifier {
	type: 'ImportSpecifier'
	local: { value: string }
}

interface ImportDefaultSpecifier {
	type: 'ImportDefaultSpecifier'
	local: { value: string }
}

interface TsTypeReference {
	type: 'TsTypeReference'
	typeName: unknown
}

interface Identifier {
	type: 'Identifier'
	value: string
}

interface TsQualifiedName {
	type: 'TsQualifiedName'
	left: unknown
	right: { value: string }
}

function isImportDeclaration(node: unknown): node is ImportDeclaration {
	return typeof node === 'object' && node !== null && (node as { type?: string }).type === 'ImportDeclaration'
}

function isImportSpecifier(node: unknown): node is ImportSpecifier {
	return typeof node === 'object' && node !== null && (node as { type?: string }).type === 'ImportSpecifier'
}

function isImportDefaultSpecifier(node: unknown): node is ImportDefaultSpecifier {
	return typeof node === 'object' && node !== null && (node as { type?: string }).type === 'ImportDefaultSpecifier'
}

function isTsTypeReference(node: unknown): node is TsTypeReference {
	return typeof node === 'object' && node !== null && (node as { type?: string }).type === 'TsTypeReference'
}

function isIdentifier(node: unknown): node is Identifier {
	return typeof node === 'object' && node !== null && (node as { type?: string }).type === 'Identifier'
}

function isTsQualifiedName(node: unknown): node is TsQualifiedName {
	return typeof node === 'object' && node !== null && (node as { type?: string }).type === 'TsQualifiedName'
}

/**
 * Check if a route config has multiple: true.
 * Uses simple regex check for efficiency.
 */
export async function checkIfMultiple(sourceFile: string): Promise<boolean> {
	try {
		const source = await fs.readFile(sourceFile, 'utf-8')
		return /multiple:\s*true/.test(source)
	} catch {
		return false
	}
}
