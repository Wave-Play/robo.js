import type { Collection } from 'discord.js'
import type { Api, Command, Config, Context, Event, FlashcoreAdapter, HandlerRecord, Middleware } from './index.js'
import type Keyv from 'keyv'

interface PortalEnabledState {
  modules: Record<string, boolean>
  commands: Record<string, boolean>
  events: Record<string, boolean>
  middleware: Record<string, boolean>
  contexts: Record<string, boolean>
}

interface Portal {
  apis: Collection<string, HandlerRecord<Api>> | null
  commands: Collection<string, HandlerRecord<Command>> | null
  context: Collection<string, HandlerRecord<Context>> | null
  events: Collection<string, HandlerRecord<Event>[]> | null
  middleware: HandlerRecord<Middleware>[]
  moduleKeys: Set<string>
  enabledState: PortalEnabledState
  serverRestrictions: Record<string, string[]>
}

interface Flashcore {
  _adapter: FlashcoreAdapter | Keyv<unknown, unknown> | null
}

interface RoboGlobal {
  config: Config | null
  flashcore: Flashcore
  portal: Portal
}

declare global {
  var robo: RoboGlobal
}