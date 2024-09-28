import { DiscordProxy } from '@robojs/patch'
import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [DiscordProxy.Vite()]
})
