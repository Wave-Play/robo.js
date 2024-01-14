import { defineConfig } from 'tsup'

export default defineConfig({
	entry: ['src/cli', 'src/default', 'src/roboplay', 'src/entry.ts'],
	outDir: 'dist',
	format: ['esm'],
	bundle: false,
	clean: false,
	dts: false,
	minify: false,
	sourcemap: false,
	treeshake: true
})
