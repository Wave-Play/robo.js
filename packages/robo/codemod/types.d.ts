// global.d.ts
declare global {
	// @ts-expect-error - native module
	const fs: typeof import('node:fs')

	// @ts-expect-error - native module
	const path: typeof import('node:path')
}

declare const console: Console

export {}
