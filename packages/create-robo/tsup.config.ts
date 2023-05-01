import { defineConfig } from 'tsup'

export default defineConfig({
	entry: ['src'],
	outDir: 'dist',
	format: ['esm'],
	bundle: false,
	clean: false,
	dts: false,
	minify: false,
	sourcemap: true,
	treeshake: true
})
