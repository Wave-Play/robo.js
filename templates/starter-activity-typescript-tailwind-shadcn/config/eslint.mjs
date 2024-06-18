import globals from 'globals'
import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
	{ ignores: ['.robo/', 'config/'] },
	{
		files: ['**/*.js', '**/*.jsx', '**/*.ts', '**/*.tsx'],
		languageOptions: {
			globals: {
				...globals.node
			}
		}
	},
	eslint.configs.recommended,
	...tseslint.configs.recommended
)
