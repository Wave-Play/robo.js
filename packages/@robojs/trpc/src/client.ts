import { createTRPCClient as _createTRPCClient, createTRPCReact as _createTRPCReact } from '@trpc/react-query'
import type { createRouter } from './api/trpc/[trpc]'
import type { CreateTRPCClientOptions, CreateTRPCReact } from '@trpc/react-query'
import type { AnyRouter } from '@trpc/server/unstable-core-do-not-import'
import type { CreateTRPCReactOptions } from '@trpc/react-query/dist/shared'

export type Router = ReturnType<typeof createRouter>

export function createTRPCReact<TRouter extends AnyRouter, TSSRContext = unknown>(
	options?: CreateTRPCReactOptions<TRouter>
): CreateTRPCReact<TRouter, TSSRContext> {
	return _createTRPCReact<TRouter, TSSRContext>(options)
}

export function createTRPCClient<AppRouter extends Router>(opts: CreateTRPCClientOptions<AppRouter>) {
	return _createTRPCClient<AppRouter>(opts)
}
