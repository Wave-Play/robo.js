import { useRef } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

interface TRPCProviderProps {
	children: ReactNode
	trpc: any
	trpcClient: any
}
export function TRPCProvider(props: TRPCProviderProps) {
	const { children, trpc, trpcClient } = props
	const queryClient = useRef(new QueryClient()).current

	return (
		<>
			{/* @ts-ignore */}
			<trpc.Provider client={trpcClient} queryClient={queryClient}>
				<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
				{/* @ts-ignore */}
			</trpc.Provider>
		</>
	)
}

