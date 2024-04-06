// @ts-expect-error - This is valid once command file is parsed
import { devRestartCommand, devRestartCommandConfig } from 'robo.js/dist/core/debug.js'

export const config = devRestartCommandConfig
export default devRestartCommand
