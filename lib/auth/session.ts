import { compare, hash } from 'bcryptjs';

const SALT_ROUNDS = 10;

/** Used for legacy users (password_hash) and set-password script. Supabase Auth users do not use this. */
export async function hashPassword(password: string) {
  return hash(password, SALT_ROUNDS);
}

/** Used for legacy users (password_hash) in updatePassword fallback. Supabase Auth users verify via signInWithPassword. */
export async function comparePasswords(
  plainTextPassword: string,
  hashedPassword: string
) {
  return compare(plainTextPassword, hashedPassword);
}
