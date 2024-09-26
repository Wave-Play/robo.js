import { defineConfig } from 'vite'
import { DiscordProxy } from '@robojs/patch'
import react from '@vitejs/plugin-react-swc'

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [
		react({
			tsDecorators: true
		}),
		DiscordProxy.Vite()
	]
})
