import React, { useRef } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

interface TRPCProviderProps {
	children: React.ReactNode
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	queryClient?: any
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	trpc: any
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	trpcClient: any
}
export function TRPCProvider(props: TRPCProviderProps) {
	const { children, queryClient = new QueryClient(), trpc, trpcClient } = props
	const client = useRef(queryClient).current

	return (
		<>
			<trpc.Provider client={trpcClient} queryClient={client}>
				<QueryClientProvider client={client}>{children}</QueryClientProvider>
			</trpc.Provider>
		</>
	)
}
