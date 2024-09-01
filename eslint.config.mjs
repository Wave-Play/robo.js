import globals from 'globals'
import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'

const ignores = [
	'**/.*',
	'node_modules/**',
	'docs/**',
	'**/dist/**',
	'**/.robo/**',
	'**/__benchmarks__/**',
	'**/__tests__/**',
	'**/tsup.config.ts',
	'**/tsup-cli.config.ts',
	'**/templates/**',
	'templates/**'
]

export default tseslint.config(
	{ ignores },
	{
		files: ['**/*.js', '**/*.jsx', '**/*.ts', '**/*.tsx'],
		languageOptions: {
			globals: {
				...globals.node
			}
		},
		rules: {
			'@typescript-eslint/no-non-null-assertion': 'off'
		}
	},
	eslint.configs.recommended,
	...tseslint.configs.recommended
)
