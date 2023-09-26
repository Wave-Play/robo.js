import { defineConfig } from 'tsup'

export default defineConfig({
	entry: ['codemod/**/*.ts'],
	outDir: 'codemod',
	format: ['esm'],
	bundle: false,
	clean: false,
	dts: false,
	minify: true,
	sourcemap: false,
	treeshake: false
})
