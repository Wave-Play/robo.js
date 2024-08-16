export interface EventOptions {
    category?: string;
    label?: string;
    numberOfExecution?: number;
    user?: userData;
    id?: number | string;
}
interface userData {
    name?: string;
    id?: string | number;
    email?: string;
}
export declare abstract class BaseAnalytics {
    abstract event(options: EventOptions): Promise<void>;
}
export declare function setAnalytics(analytics: BaseAnalytics): void;
export declare const Analytics: {
    event: (options: EventOptions) => Promise<void>;
};
export {};
