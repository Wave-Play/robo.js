import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { resolve } from 'path'
import { copyFileSync, mkdirSync, writeFileSync } from 'fs'
import { createRequire } from 'module'

/**
 * Vite plugin that writes a signal file after build completes.
 * Used by @robojs/server to know when it's safe to reload the browser.
 */
function buildSignal() {
	return {
		name: 'robo-build-signal',
		closeBundle() {
			// Write signal file after all assets are written
			const signalPath = resolve(process.cwd(), 'public/stage/.build-signal')
			writeFileSync(signalPath, JSON.stringify({ timestamp: Date.now() }))
		}
	}
}

/**
 * Vite plugin that copies Silero VAD static assets (ONNX model, audio worklet,
 * WASM runtime) from node_modules into the build output so they can be served
 * from the same domain without relying on external CDNs.
 */
function copyVadAssets() {
	const localRequire = createRequire(import.meta.url)
	return {
		name: 'copy-vad-assets',
		closeBundle() {
			// Copy directly into the build output root (alongside index.html)
			// so they're served from the same path as other stage assets
			const outDir = resolve(process.cwd(), 'public/stage')

			// Resolve vad-web dist directory
			const vadDist = resolve(localRequire.resolve('@ricky0123/vad-web'), '..')

			// Resolve onnxruntime-web through vad-web (transitive dep in pnpm)
			const vadRequire = createRequire(resolve(vadDist, 'index.js'))
			const ortDist = resolve(vadRequire.resolve('onnxruntime-web'), '..')

			copyFileSync(resolve(vadDist, 'silero_vad_legacy.onnx'), resolve(outDir, 'silero_vad_legacy.onnx'))
			copyFileSync(resolve(vadDist, 'vad.worklet.bundle.min.js'), resolve(outDir, 'vad.worklet.bundle.min.js'))
			copyFileSync(resolve(ortDist, 'ort-wasm-simd-threaded.mjs'), resolve(outDir, 'ort-wasm-simd-threaded.mjs'))
			copyFileSync(resolve(ortDist, 'ort-wasm-simd-threaded.wasm'), resolve(outDir, 'ort-wasm-simd-threaded.wasm'))
		}
	}
}

/**
 * Vite config for building the Stage UI.
 * Outputs to public/stage/ with relative base paths for portability.
 */
export default defineConfig({
	plugins: [react(), copyVadAssets(), buildSignal()],
	base: './',
	publicDir: false, // Disable copying public/ to avoid conflict
	resolve: {
		alias: {
			'@': resolve(process.cwd(), 'src/app')
		}
	},
	build: {
		outDir: 'public/stage',
		emptyOutDir: true
	}
})
