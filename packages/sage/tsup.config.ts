import { defineConfig } from 'tsup'

export default defineConfig({
	entry: ['src'],
	outDir: 'dist',
	format: ['esm'],
	bundle: false,
	clean: true,
	dts: false,
	minify: false,
	sourcemap: true,
	treeshake: true
})
