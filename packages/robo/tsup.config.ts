import { defineConfig } from 'tsup'

export default defineConfig({
	entry: ['src', '!src/cli', '!src/default', '!src/roboplay', '!src/entry.ts'],
	outDir: 'dist',
	format: ['esm'],
	bundle: false,
	clean: true,
	dts: true,
	minify: true,
	sourcemap: true,
	treeshake: true
})
