/**
 * Playwright tests for WebContainerProvider
 *
 * These tests run in real Chromium to validate WebContainer integration.
 * They test file operations, command execution, and session management.
 */

import { test, expect, type Page } from '@playwright/test'

// Extended timeout for WebContainer operations
test.setTimeout(120000)

/**
 * Wait for WebContainer to boot and return the container instance
 */
async function waitForWebContainer(page: Page): Promise<void> {
	await page.waitForFunction(
		() => {
			const harness = (window as unknown as { testHarness: { status: string } }).testHarness
			return harness.status === 'ready' || harness.status === 'error'
		},
		{ timeout: 60000 }
	)

	const status = await page.evaluate(() => {
		return (window as unknown as { testHarness: { status: string; lastError?: Error } }).testHarness.status
	})

	if (status === 'error') {
		const error = await page.evaluate(() => {
			const harness = (window as unknown as { testHarness: { lastError?: Error } }).testHarness
			return harness.lastError?.message || 'Unknown error'
		})
		throw new Error(`WebContainer failed to boot: ${error}`)
	}
}

/**
 * Inject the WebContainerProvider into the page
 */
async function injectProvider(page: Page): Promise<void> {
	await page.addScriptTag({
		content: `
			window.createProvider = async function(config = {}) {
				const container = window.getWebContainer();
				if (!container) throw new Error('WebContainer not available');

				// Create a simple provider wrapper that mimics the TypeScript implementation
				const provider = {
					container,
					rootDir: config.rootDir || '/',
					denyPaths: config.denyPaths || [],

					normalizePath(p) {
						// Simple normalization
						return '/' + p.split('/').filter(s => s && s !== '.').join('/');
					},

					resolvePath(virtualPath) {
						let normalized = this.normalizePath(virtualPath);
						// Check deny paths
						for (const deny of this.denyPaths) {
							if (normalized === deny || normalized.startsWith(deny + '/')) {
								throw new Error('POLICY_VIOLATION: Path denied');
							}
						}
						return this.rootDir === '/' ? normalized : this.rootDir + normalized;
					},

					async readFile(filePath) {
						const absPath = this.resolvePath(filePath);
						return await container.fs.readFile(absPath, 'utf-8');
					},

					async writeFile(filePath, content) {
						const absPath = this.resolvePath(filePath);
						// Ensure parent directory exists
						const parent = absPath.substring(0, absPath.lastIndexOf('/')) || '/';
						if (parent !== '/') {
							await container.fs.mkdir(parent, { recursive: true }).catch(() => {});
						}
						await container.fs.writeFile(absPath, content);
					},

					async deletePath(filePath, opts = {}) {
						const absPath = this.resolvePath(filePath);
						await container.fs.rm(absPath, { recursive: opts.recursive || false });
					},

					async exists(filePath) {
						const absPath = this.resolvePath(filePath);
						try {
							await container.fs.readFile(absPath);
							return true;
						} catch {
							try {
								await container.fs.readdir(absPath);
								return true;
							} catch {
								return false;
							}
						}
					},

					async readdir(dirPath, opts = {}) {
						const absPath = this.resolvePath(dirPath);
						const entries = await container.fs.readdir(absPath, { withFileTypes: true });
						return entries.map(entry => ({
							name: entry.name,
							path: (dirPath === '/' ? '/' : dirPath + '/') + entry.name,
							isDirectory: entry.isDirectory(),
							isFile: entry.isFile()
						}));
					},

					async mkdir(dirPath, opts = {}) {
						const absPath = this.resolvePath(dirPath);
						await container.fs.mkdir(absPath, { recursive: opts.recursive || false });
					},

					async run(command, args = [], opts = {}) {
						const process = await container.spawn(command, args, {
							cwd: opts.cwd || this.rootDir,
							env: opts.env
						});

						let output = '';
						const reader = process.output.getReader();
						try {
							while (true) {
								const { done, value } = await reader.read();
								if (done) break;
								output += value;
							}
						} finally {
							reader.releaseLock();
						}

						const exitCode = await process.exit;
						return { exitCode, output };
					}
				};

				window.testProvider = provider;
				return provider;
			};
		`
	})
}

test.describe('WebContainerProvider', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/')
		await waitForWebContainer(page)
		await injectProvider(page)
		await page.evaluate(() => window.createProvider())
	})

	test.describe('File Operations', () => {
		test('can write and read a file', async ({ page }) => {
			const result = await page.evaluate(async () => {
				const provider = (
					window as unknown as {
						testProvider: {
							writeFile: (p: string, c: string) => Promise<void>
							readFile: (p: string) => Promise<string>
						}
					}
				).testProvider
				await provider.writeFile('/test.txt', 'Hello, WebContainer!')
				return await provider.readFile('/test.txt')
			})

			expect(result).toBe('Hello, WebContainer!')
		})

		test('can write files in nested directories', async ({ page }) => {
			const result = await page.evaluate(async () => {
				const provider = (
					window as unknown as {
						testProvider: {
							writeFile: (p: string, c: string) => Promise<void>
							readFile: (p: string) => Promise<string>
						}
					}
				).testProvider
				await provider.writeFile('/src/utils/helper.ts', 'export const foo = 42;')
				return await provider.readFile('/src/utils/helper.ts')
			})

			expect(result).toBe('export const foo = 42;')
		})

		test('can check file existence', async ({ page }) => {
			const result = await page.evaluate(async () => {
				const provider = (
					window as unknown as {
						testProvider: {
							writeFile: (p: string, c: string) => Promise<void>
							exists: (p: string) => Promise<boolean>
						}
					}
				).testProvider
				const beforeWrite = await provider.exists('/existence-test.txt')
				await provider.writeFile('/existence-test.txt', 'test')
				const afterWrite = await provider.exists('/existence-test.txt')
				return { beforeWrite, afterWrite }
			})

			expect(result.beforeWrite).toBe(false)
			expect(result.afterWrite).toBe(true)
		})

		test('can delete files', async ({ page }) => {
			const result = await page.evaluate(async () => {
				const provider = (
					window as unknown as {
						testProvider: {
							writeFile: (p: string, c: string) => Promise<void>
							deletePath: (p: string) => Promise<void>
							exists: (p: string) => Promise<boolean>
						}
					}
				).testProvider
				await provider.writeFile('/to-delete.txt', 'temporary')
				await provider.deletePath('/to-delete.txt')
				return await provider.exists('/to-delete.txt')
			})

			expect(result).toBe(false)
		})

		test('can create and list directories', async ({ page }) => {
			const result = await page.evaluate(async () => {
				interface DirEntry {
					name: string
					path: string
					isDirectory: boolean
					isFile: boolean
				}
				const provider = (
					window as unknown as {
						testProvider: {
							mkdir: (p: string) => Promise<void>
							writeFile: (p: string, c: string) => Promise<void>
							readdir: (p: string) => Promise<DirEntry[]>
						}
					}
				).testProvider
				await provider.mkdir('/test-dir')
				await provider.writeFile('/test-dir/file1.txt', 'content1')
				await provider.writeFile('/test-dir/file2.txt', 'content2')
				return await provider.readdir('/test-dir')
			})

			expect(result).toHaveLength(2)
			expect(result.map((e: { name: string }) => e.name).sort()).toEqual(['file1.txt', 'file2.txt'])
		})
	})

	test.describe('Command Execution', () => {
		test('can run node --version', async ({ page }) => {
			const result = await page.evaluate(async () => {
				const provider = (
					window as unknown as {
						testProvider: { run: (cmd: string, args: string[]) => Promise<{ exitCode: number; output: string }> }
					}
				).testProvider
				return await provider.run('node', ['--version'])
			})

			expect(result.exitCode).toBe(0)
			expect(result.output).toMatch(/^v\d+\.\d+\.\d+/)
		})

		test('can run npm --version', async ({ page }) => {
			const result = await page.evaluate(async () => {
				const provider = (
					window as unknown as {
						testProvider: { run: (cmd: string, args: string[]) => Promise<{ exitCode: number; output: string }> }
					}
				).testProvider
				return await provider.run('npm', ['--version'])
			})

			expect(result.exitCode).toBe(0)
			expect(result.output).toMatch(/^\d+\.\d+\.\d+/)
		})

		test('can run node script and capture output', async ({ page }) => {
			const result = await page.evaluate(async () => {
				const provider = (
					window as unknown as {
						testProvider: {
							writeFile: (p: string, c: string) => Promise<void>
							run: (cmd: string, args: string[]) => Promise<{ exitCode: number; output: string }>
						}
					}
				).testProvider
				await provider.writeFile('/script.js', 'console.log("Hello from script!");')
				return await provider.run('node', ['/script.js'])
			})

			expect(result.exitCode).toBe(0)
			expect(result.output).toContain('Hello from script!')
		})

		test('captures non-zero exit codes', async ({ page }) => {
			const result = await page.evaluate(async () => {
				const provider = (
					window as unknown as {
						testProvider: {
							writeFile: (p: string, c: string) => Promise<void>
							run: (cmd: string, args: string[]) => Promise<{ exitCode: number; output: string }>
						}
					}
				).testProvider
				await provider.writeFile('/exit-code.js', 'process.exit(42);')
				return await provider.run('node', ['/exit-code.js'])
			})

			expect(result.exitCode).toBe(42)
		})
	})

	test.describe('Path Security', () => {
		test('denies access to specified paths', async ({ page }) => {
			const error = await page.evaluate(async () => {
				interface Provider {
					readFile: (p: string) => Promise<string>
				}
				const createProvider = (
					window as unknown as { createProvider: (config: { denyPaths: string[] }) => Promise<Provider> }
				).createProvider
				const provider = await createProvider({ denyPaths: ['/secret'] })
				try {
					await provider.readFile('/secret/data.txt')
					return null
				} catch (e) {
					return (e as Error).message
				}
			})

			expect(error).toContain('POLICY_VIOLATION')
		})
	})
})
