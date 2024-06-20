import type { RoboRequest } from '@robojs/server';
import type { Router } from '@trpc/server';
type RouterType = Router<any>;
export declare function registerRouter(router: RouterType): void;
declare const _default: (req: RoboRequest) => Promise<Response>;
export default _default;
