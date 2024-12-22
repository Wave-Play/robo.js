import { Env } from 'robo.js'

Env.loadSync()
export const env = new Env({
	b2: {
		bucket: {
			default: 'robo-templates',
			env: 'B2_BUCKET'
		}
	},
	debug: {
		default: 'false',
		env: 'DEBUG'
	},
	forceTemplates: {
		default: 'false',
		env: 'FORCE_TEMPLATES'
	},
	github: {
		pushObject: {
			env: 'GH_PUSH'
		},
		repo: {
			default: 'Nazeofel/robo.js',
			env: 'REPO_DATA'
		},
		token: {
			env: 'GH_TOKEN'
		}
	},
	robo: {
		logLevel: {
			default: 'info',
			env: 'ROBO_LOG_LEVEL'
		}
	}
})
