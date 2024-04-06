// @ts-expect-error - This is valid once command file is parsed
import { devStatusCommand, devStatusCommandConfig } from 'robo.js/dist/core/debug.js'

export const config = devStatusCommandConfig
export default devStatusCommand
