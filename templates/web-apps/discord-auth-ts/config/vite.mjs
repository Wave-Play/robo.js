import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { tanstackRouter } from '@tanstack/router-plugin/vite'

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
	  routesDirectory: "./src/app/routes",
	  generatedRouteTree: "./src/app/routeTree.gen.ts"
    }), react()],
	server: {
		allowedHosts: true
	}
})
