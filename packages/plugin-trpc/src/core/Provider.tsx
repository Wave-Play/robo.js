import React from 'react'

interface TRPCProviderProps {
	children: React.ReactNode
	queryClient: any
	trpc: any
	trpcClient: any
}
export function TRPCProvider(props: TRPCProviderProps) {
	const { children, queryClient, trpc, trpcClient } = props

	return (
		<>
			{/* @ts-ignore */}
			<trpc.Provider client={trpcClient} queryClient={queryClient}>
				{children}
				{/* @ts-ignore */}
			</trpc.Provider>
		</>
	)
}
