import globals from 'globals'
import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'

const ignores = [
	'**/.*',
	'node_modules/**',
	'docs/**',
	'docs-legacy/**',
	'**/dist/**',
	'**/.robo/**',
	'**/__benchmarks__/**',
	'**/__tests__/**',
	'**/tsup.config.ts',
	'**/tsup-cli.config.ts',
	'**/templates/**',
	'templates/**',
	'temp/**',
	'**/public/**'
]

export default tseslint.config(
	{ ignores },
	eslint.configs.recommended,
	...tseslint.configs.recommended,
	{
		files: ['**/*.js', '**/*.jsx', '**/*.ts', '**/*.tsx', '**/*.mjs', '**/*.cjs'],
		languageOptions: {
			globals: {
				...globals.node
			}
		},
		rules: {
			'@typescript-eslint/no-non-null-assertion': 'off',
			'@typescript-eslint/no-unused-vars': ['error', {
				argsIgnorePattern: '^_',
				varsIgnorePattern: '^_',
				destructuredArrayIgnorePattern: '^_',
				caughtErrorsIgnorePattern: '^_'
			}],
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/no-var-requires': 'off',
			'@typescript-eslint/ban-types': 'off',
			'@typescript-eslint/no-this-alias': 'off',
			'no-control-regex': 'off',
			'no-case-declarations': 'off'
		}
	},
	{
		files: ['**/*.cjs'],
		languageOptions: {
			globals: {
				...globals.node,
				...globals.commonjs
			}
		}
	},
	{
		files: ['**/*.d.ts'],
		rules: {
			'no-var': 'off'
		}
	}
)
