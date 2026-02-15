import react from '@vitejs/plugin-react-swc'
import { DiscordProxy } from '@robojs/patch'
import { defineConfig } from 'vite'

export default defineConfig({
	plugins: [DiscordProxy.Vite(), react()],
	server: {
		allowedHosts: true
	}
})
