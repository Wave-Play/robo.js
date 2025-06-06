import { DiscordProxy } from '@robojs/patch'
import react from '@vitejs/plugin-react-swc'
import { resolve } from 'path'
import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [react(), DiscordProxy.Vite()],
	css: {
		postcss: 'config/postcss.config.mjs'
	},
	server: {
		allowedHosts: true
	}
})
