import tailwindcss from '@tailwindcss/postcss'
import autoprefixer from 'autoprefixer'

export default {
 plugins: [tailwindcss({config: './tailwind.config.mjs'}), autoprefixer()]
}
