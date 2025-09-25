import argon2 from 'argon2'
import { nanoid } from 'nanoid'
import { Flashcore } from 'robo.js'
import type { PasswordRecord } from './types.js'

const NS_PASSWORD = 'auth_password'
const NS_PASSWORD_EMAIL = 'auth_passwordUserByEmail'

const PASSWORD_KEY = (userId: string) => userId
const PASSWORD_EMAIL_KEY = (email: string) => email.toLowerCase()

export async function storePassword(userId: string, email: string, password: string): Promise<PasswordRecord> {
  const hash = await argon2.hash(password, { type: argon2.argon2id })
  const now = new Date().toISOString()
  const record: PasswordRecord = {
    id: nanoid(16),
    email: email.toLowerCase(),
    hash,
    userId,
    createdAt: now,
    updatedAt: now,
  }
  await Flashcore.set(PASSWORD_KEY(userId), record, { namespace: NS_PASSWORD })
  await Flashcore.set(PASSWORD_EMAIL_KEY(record.email), userId, { namespace: NS_PASSWORD_EMAIL })
  return record
}

export async function verifyPassword(userId: string, password: string): Promise<boolean> {
  const record = await Flashcore.get<PasswordRecord | null>(PASSWORD_KEY(userId), { namespace: NS_PASSWORD })
  if (!record) return false
  return argon2.verify(record.hash, password)
}

export async function findUserIdByEmail(email: string): Promise<string | null> {
  const id = await Flashcore.get<string | null>(PASSWORD_EMAIL_KEY(email), { namespace: NS_PASSWORD_EMAIL })
  return id ?? null
}

export async function removePassword(userId: string): Promise<void> {
  const record = await Flashcore.get<PasswordRecord | null>(PASSWORD_KEY(userId), { namespace: NS_PASSWORD })
  if (record?.email) {
    await Flashcore.delete(PASSWORD_EMAIL_KEY(record.email), { namespace: NS_PASSWORD_EMAIL })
  }
  await Flashcore.delete(PASSWORD_KEY(userId), { namespace: NS_PASSWORD })
}

export async function resetPassword(userId: string, password: string): Promise<PasswordRecord | null> {
  const existing = await Flashcore.get<PasswordRecord | null>(PASSWORD_KEY(userId), { namespace: NS_PASSWORD })
  if (!existing) return null
  const hash = await argon2.hash(password, { type: argon2.argon2id })
  const updated: PasswordRecord = { ...existing, hash, updatedAt: new Date().toISOString() }
  await Flashcore.set(PASSWORD_KEY(userId), updated, { namespace: NS_PASSWORD })
  return updated
}

