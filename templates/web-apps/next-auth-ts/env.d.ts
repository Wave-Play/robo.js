export {}
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      AUTH_SECRET: string;
      DATABASE_URL: string;
      NODE_OPTIONS: string;
      PORT: string;
    }
  }
}