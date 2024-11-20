import path from 'node:path'
import { defineConfig } from 'vite'

// eslint-disable-next-line no-undef
const DiscordProxyEntry = path.resolve(process.cwd(), 'src/discord-proxy/script.ts')

export default defineConfig({
	build: {
		lib: {
			entry: DiscordProxyEntry,
			name: 'DiscordProxyPatch',
			fileName: (format) => `discord-proxy-patch.${format}.js`
		},
		rollupOptions: {
			output: {
				format: 'iife'
			}
		}
	}
})
