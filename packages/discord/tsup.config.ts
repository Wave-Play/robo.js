import { defineConfig } from 'tsup'

export default defineConfig({
	entry: ['src', '!src/cli', '!src/default', '!src/entry.ts'],
	outDir: 'dist',
	format: ['esm'],
	bundle: false,
	clean: false,
	dts: true,
	minify: true,
	sourcemap: true,
	treeshake: true
})
