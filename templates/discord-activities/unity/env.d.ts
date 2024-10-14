export {}
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      DISCORD_CLIENT_ID: string;
      VITE_DISCORD_CLIENT_ID: string;
      DISCORD_CLIENT_SECRET: string;
      NODE_OPTIONS: string;
      PORT: string;
    }
  }
}