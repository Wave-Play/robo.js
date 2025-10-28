import { Globals } from './globals.js'
import type { HandlerRecord, Command, Event, Middleware, Context } from '../types/index.js'

export type ID = string

export type ComponentType = 'module' | 'command' | 'event' | 'middleware' | 'context'

export const portalUtils = {
  isEnabled: (
    enabledState: Record<string, boolean>,
    key: string
  ): boolean => {
    return enabledState[key] ?? true
  },

  setEnabled: (
    enabledState: Record<string, boolean>,
    key: string,
    enabled: boolean
  ): void => {
    enabledState[key] = enabled
  },

  isEnabledForServer: (
    serverRestrictions: Record<string, string[]>,
    key: string,
    serverId: ID
  ): boolean => {
    const restrictions = serverRestrictions[key]
    if (!restrictions || restrictions.length === 0) {
      return true
    }
    return restrictions.includes(serverId)
  },

  setServerOnly: (
    serverRestrictions: Record<string, string[]>,
    key: string,
    serverIds: string[] | string
  ): void => {
    const servers = Array.isArray(serverIds) ? serverIds : [serverIds]
    serverRestrictions[key] = servers
  },

  unregisterModuleCommands: (
    enabledCommands: Record<string, boolean>,
    moduleName: string
  ): void => {
    const commands = Globals.getPortalValues().commands
    if (!commands) return

    commands.forEach((command: HandlerRecord<Command>, key: string) => {
      if (command.module === moduleName) {
        enabledCommands[key] = false
      }
    })
  },

  unregisterModuleEvents: (
    enabledEvents: Record<string, boolean>,
    moduleName: string
  ): void => {
    const events = Globals.getPortalValues().events
    if (!events) return

    events.forEach((eventHandlers: HandlerRecord<Event>[], eventName: string) => {
      eventHandlers.forEach((handler: HandlerRecord<Event>, index: number) => {
        if (handler.module === moduleName) {
          const key = `${eventName}:${index}`
          enabledEvents[key] = false
        }
      })
    })
  },

  unregisterModuleMiddleware: (
    enabledMiddleware: Record<string, boolean>,
    moduleName: string
  ): void => {
    const middleware = Globals.getPortalValues().middleware
    middleware.forEach((mw: HandlerRecord<Middleware>, index: number) => {
      if (mw.module === moduleName) {
        enabledMiddleware[index.toString()] = false
      }
    })
  },

  unregisterModuleContexts: (
    enabledContexts: Record<string, boolean>,
    moduleName: string
  ): void => {
    const contexts = Globals.getPortalValues().context
    if (!contexts) return

    contexts.forEach((context: HandlerRecord<Context>, key: string) => {
      if (context.module === moduleName) {
        enabledContexts[key] = false
      }
    })
  },

  applyModuleServerRestrictions: (
    serverRestrictions: Record<string, string[]>,
    moduleName: string
  ): void => {
    const servers = serverRestrictions[moduleName]
    if (!servers || servers.length === 0) return

    const commands = Globals.getPortalValues().commands
    if (commands) {
      commands.forEach((command: HandlerRecord<Command>, key: string) => {
        if (command.module === moduleName) {
          serverRestrictions[key] = servers
        }
      })
    }

    const events = Globals.getPortalValues().events
    if (events) {
      events.forEach((eventHandlers: HandlerRecord<Event>[], eventName: string) => {
        eventHandlers.forEach((handler: HandlerRecord<Event>, index: number) => {
          if (handler.module === moduleName) {
            const key = `${eventName}:${index}`
            serverRestrictions[key] = servers
          }
        })
      })
    }

    const middleware = Globals.getPortalValues().middleware
    middleware.forEach((mw: HandlerRecord<Middleware>, index: number) => {
      if (mw.module === moduleName) {
        serverRestrictions[index.toString()] = servers
      }
    })

    const contexts = Globals.getPortalValues().context
    if (contexts) {
      contexts.forEach((context: HandlerRecord<Context>, key: string) => {
        if (context.module === moduleName) {
          serverRestrictions[key] = servers
        }
      })
    }
  }
}