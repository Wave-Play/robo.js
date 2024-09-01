interface CommonOptions {
    action?: string;
    url?: string;
    domain?: string;
    userID?: number | string;
    actionType?: string;
    type?: string;
    name: string;
    data?: unknown;
    referrer?: string;
    revenue?: {
        currency: string;
        amount: number | string;
    };
}
export interface EventOptions extends CommonOptions {
}
export interface ViewOptions extends CommonOptions {
    element?: string;
    elementIdentifier?: string;
}
export declare abstract class BaseEngine {
    abstract event(options: EventOptions): Promise<void> | void;
    abstract view(page: string, options: ViewOptions): Promise<void> | void;
}
export declare function setAnalytics(analytics: BaseEngine): void;
export declare const Analytics: Readonly<{
    event: (options: EventOptions) => void | Promise<void>;
    view: (page: string, options: ViewOptions) => void | Promise<void>;
    isReady: () => boolean;
}>;
export {};
