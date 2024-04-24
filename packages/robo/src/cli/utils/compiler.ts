import fs from 'fs/promises'
import path from 'path'
import { hasProperties, replaceSrcWithBuildInRecord } from './utils.js'
import { logger } from '../../core/logger.js'
import { env } from '../../core/env.js'
import { IS_BUN } from './runtime-utils.js'
import type { default as Typescript, CompilerOptions, Diagnostic } from 'typescript'
import type { transform as SwcTransform } from '@swc/core'

const srcDir = path.join(process.cwd(), 'src')

// Load Typescript compiler in a try/catch block
// This is to maintain compatibility with JS-only projects
let ts: typeof Typescript
let transform: typeof SwcTransform
try {
	if (!IS_BUN) {
		const [typescript, swc] = await Promise.all([import('typescript'), import('@swc/core')])
		ts = typescript.default
		transform = swc.transform
	}
} catch {
	// Ignore
}

/**
 * Recursively traverse a directory and transform TypeScript files using SWC
 *
 * @param dir
 * @param compilerOptions
 */
async function traverse(
	dir: string,
	distDir: string,
	options: RoboCompileOptions,
	compilerOptions: CompilerOptions,
	transform: typeof SwcTransform
) {
	const { excludePaths = [], parallel = 20 } = options
	const isIncremental = options.files?.length > 0

	// Read directory contents
	let files
	try {
		if (isIncremental) {
			files = options.files.map((file) => path.join(process.cwd(), file))
			logger.debug(`Incrementally compiling:`, files)
		} else {
			files = await fs.readdir(dir)
		}
	} catch (e) {
		if (hasProperties<{ code: unknown }>(e, ['code']) && e.code === 'ENOENT') {
			logger.debug(`Directory ${dir} does not exist, skipping traversal.`)
			return
		} else {
			throw e
		}
	}
	const tasks = []

	for (const file of files) {
		const filePath = isIncremental ? file : path.join(dir, file)
		const relativePath = '/' + path.relative(process.cwd(), filePath)
		const stat = await fs.stat(filePath)

		// Recursively traverse subdirectories, only if no files are specified
		if (stat.isDirectory() && !isIncremental) {
			tasks.push(traverse(filePath, distDir, options, compilerOptions, transform))
		} else if (/\.(js|ts|tsx)$/.test(file) && !excludePaths.some((p) => relativePath.startsWith(p))) {
			// Queue up a task to transform the file
			tasks.push(
				(async () => {
					const fileContents = await fs.readFile(filePath, 'utf-8')
					const compileResult = await transform(fileContents, {
						filename: filePath,
						module: {
							type: 'es6',
							strict: false,
							strictMode: true,
							lazy: false,
							noInterop: false,
							// @ts-expect-error - works but not in SWC types
							// Necessary to ensure "/index.js" imports compile correctly in Linux
							resolveFully: true
						},
						sourceMaps: env.nodeEnv === 'production' ? false : 'inline',
						jsc: {
							target: 'esnext',
							baseUrl: options.baseUrl,
							paths: options.paths,
							parser: {
								syntax: 'typescript',
								tsx: filePath.endsWith('.tsx'),
								dynamicImport: true,
								decorators: compilerOptions.experimentalDecorators ?? true
							},
							transform: {
								legacyDecorator: compilerOptions.experimentalDecorators ?? true,
								useDefineForClassFields: compilerOptions.useDefineForClassFields ?? false
							}
						}
					})

					// Write transformed code to destination directory
					const distPath = path.join(distDir, path.relative(srcDir, filePath.replace(/\.(js|ts|tsx)$/, '.js')))
					await fs.mkdir(path.dirname(distPath), { recursive: true })
					await fs.writeFile(distPath, compileResult.code)
				})()
			)
		}
		if (tasks.length >= parallel) {
			// Wait for the currently running tasks to complete
			await Promise.all(tasks)
			tasks.length = 0
		}
	}

	// Wait for any remaining tasks to complete
	await Promise.all(tasks)
}

interface RoboCompileOptions {
	baseUrl?: string
	distDir?: string
	excludePaths?: string[]
	files?: string[]
	parallel?: number
	paths?: Record<string, string[]>
	plugin?: boolean
}

export async function compile(options?: RoboCompileOptions) {
	const startTime = Date.now()
	const distDir = options.distDir
		? path.join(process.cwd(), options.distDir)
		: path.join(process.cwd(), '.robo', 'build')

	// Force load compilers for Bun in plugin builds
	if (IS_BUN && options?.plugin) {
		await preloadTypescript()
	}

	if (typeof ts === 'undefined' || typeof transform === 'undefined') {
		// If either of them fail, just copy the srcDir to distDir
		await fs.rm(distDir, { recursive: true, force: true })
		logger.debug(`Cannot find Typescript or SWC! Copying source without compiling...`)
		await copyDir(srcDir, distDir, [], options.excludePaths ?? [])

		return Date.now() - startTime
	}

	// Read the tsconfig.json file
	const configFileName = path.join(process.cwd(), 'tsconfig.json')
	try {
		await fs.access(configFileName)
	} catch (error) {
		await fs.rm(distDir, { recursive: true, force: true })
		logger.debug(`Cannot find tsconfig.json! Copying source without compiling...`)
		await copyDir(srcDir, distDir, [], options.excludePaths ?? [])

		return Date.now() - startTime
	}

	// Parse tsconfig.json and convert compiler options
	const configFileContents = await fs.readFile(configFileName, 'utf8')
	const { config: tsconfig, error } = ts.parseConfigFileTextToJson(configFileName, configFileContents)
	if (error) {
		logger.error('Error parsing tsconfig.json:', error)
		process.exit(1)
	}

	const { options: tsOptions } = ts.convertCompilerOptionsFromJson(
		tsconfig.compilerOptions,
		path.dirname(configFileName)
	)
	if (tsOptions.errors) {
		logger.error('Error parsing compiler options from tsconfig.json')
		process.exit(1)
	}

	// Clear the destination directory before compiling
	if (!options?.files?.length) {
		logger.debug(`Cleaning ${distDir}...`)
		await fs.rm(distDir, { recursive: true, force: true })
	}

	// Traverse the source directory and transform files
	logger.debug(`Compiling ${srcDir} to ${distDir}...`)
	const baseUrl = tsOptions.baseUrl ?? process.cwd()
	const compileOptions = {
		baseUrl: baseUrl,
		paths: replaceSrcWithBuildInRecord(tsOptions.paths ?? {}),
		...(options ?? {})
	}
	logger.debug(`Compiler options:`, compileOptions)
	await traverse(srcDir, distDir, compileOptions, tsOptions, transform)
	await fs.rm(path.join(process.cwd(), '.swc'), { recursive: true, force: true })

	// Copy any non-TypeScript files to the destination directory
	logger.debug(`Copying additional non-TypeScript files from ${srcDir} to ${distDir}...`)
	await copyDir(srcDir, distDir, ['.ts', '.tsx'], options.excludePaths ?? [])

	// Generate declaration files for plugins
	if (options?.plugin) {
		const declarationTime = Date.now()
		logger.debug(`Generating declaration files for plugins...`)
		compileDeclarationFiles(tsOptions)
		logger.debug(`Generated declaration files in ${Date.now() - declarationTime}ms`)
	}

	logger.debug(`Compiled successfully!`)
	return Date.now() - startTime
}

async function copyDir(src: string, dest: string, excludeExtensions: string[], excludePaths: string[]) {
	await fs.mkdir(dest, { recursive: true })
	const entries = await fs.readdir(src)

	for (const entry of entries) {
		const srcPath = path.join(src, entry)
		const destPath = path.join(dest, entry)

		const entryStat = await fs.stat(srcPath)
		const entryExt = path.extname(srcPath)
		const relativePath = '/' + path.relative(process.cwd(), srcPath)
		const isIgnored = excludePaths.some((p) => relativePath.startsWith(p))

		if (isIgnored || excludeExtensions.includes(entryExt)) {
			continue
		} else if (entryStat.isDirectory()) {
			await copyDir(srcPath, destPath, excludeExtensions, excludePaths)
		} else {
			await fs.copyFile(srcPath, destPath)
		}
	}
}

function compileDeclarationFiles(tsOptions?: CompilerOptions) {
	// Define the compiler options specifically for declaration files
	const options: CompilerOptions = {
		target: ts.ScriptTarget.Latest,
		rootDir: 'src',
		outDir: '.robo/build',
		declaration: true,
		emitDeclarationOnly: true,
		moduleResolution: ts.ModuleResolutionKind.NodeNext,
		noEmit: false,
		skipLibCheck: true,
		...(tsOptions ?? {}),
		incremental: false
	}

	// Emit the declaration files
	const fileNames = ts.sys.readDirectory('src', ['.ts', '.tsx'])
	const program = ts.createProgram(fileNames, options)
	const emitResult = program.emit()

	// Collect and display the diagnostics, if any
	const allDiagnostics = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics)
	allDiagnostics.forEach((diagnostic) => {
		switch (diagnostic.category) {
			case ts.DiagnosticCategory.Error:
				logger.error(formatDiagnostic(diagnostic))
				break
			case ts.DiagnosticCategory.Warning:
				logger.warn(formatDiagnostic(diagnostic))
				break
			case ts.DiagnosticCategory.Message:
			case ts.DiagnosticCategory.Suggestion:
				logger.info(formatDiagnostic(diagnostic))
				break
		}
	})

	// Exit the process if there were any errors
	if (emitResult.emitSkipped) {
		process.exit(1)
	}
}

function formatDiagnostic(diagnostic: Diagnostic): string {
	if (diagnostic.file) {
		const { line, character } = ts.getLineAndCharacterOfPosition(diagnostic.file, diagnostic.start)
		const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
		return `${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}`
	} else {
		return ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
	}
}
