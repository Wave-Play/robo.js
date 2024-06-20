import type { ReactNode } from 'react';
interface TRPCProviderProps {
    children: ReactNode;
    trpc: any;
    trpcClient: any;
}
export declare function TRPCProvider(props: TRPCProviderProps): import("react/jsx-runtime").JSX.Element;
export {};
