import { createHash } from 'crypto';

// Application-level salt for password hashing
// This prevents rainbow table attacks
const PASSWORD_SALT = 'sikapos-gha-pin-v1-d4nn1t3ch';

/**
 * Hash a password using SHA-256 with a salt.
 * Returns a 64-character hex string.
 */
export function hashPassword(password: string): string {
  return createHash('sha256').update(password + PASSWORD_SALT).digest('hex');
}

/** @deprecated Use hashPassword instead */
export const hashPin = hashPassword;

/**
 * Check if a stored password value is already hashed (64 hex chars) or plain text.
 */
export function isPasswordHashed(storedPassword: string): boolean {
  return storedPassword.length === 64 && /^[a-f0-9]+$/.test(storedPassword);
}

/** @deprecated Use isPasswordHashed instead */
export const isPinHashed = isPasswordHashed;
