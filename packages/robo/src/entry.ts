/**
 * This entry file is necessary for `robo dev` to work.
 *
 * For some reason, process exit events are not being delegated when trying to
 * kill the Commander process. This worksaround that by starting `node` directly instead.
 *
 * As a bonus, this also reduces the overhead of the `robo` CLI.
 */
import { Robo } from './core/robo.js'
import { stateLoad } from './core/process.js'

Robo.start({ stateLoad })
