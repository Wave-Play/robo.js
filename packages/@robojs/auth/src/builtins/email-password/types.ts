export interface PasswordRecord {
  id: string
  userId: string
  email: string
  hash: string
  createdAt: string
  updatedAt: string
}

export interface PasswordResetToken {
  token: string
  userId: string
  expires: Date
}

export interface EmailPasswordProviderOptions {
  adapter: import('@auth/core/adapters').Adapter
  name?: string
}

