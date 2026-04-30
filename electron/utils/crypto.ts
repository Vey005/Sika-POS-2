import { createHash } from 'crypto';

// Application-level salt for PIN hashing
// This prevents rainbow table attacks against the 10,000 possible 4-digit PINs
const PIN_SALT = 'sikapos-gha-pin-v1-d4nn1t3ch';

/**
 * Hash a 4-digit PIN using SHA-256 with a salt.
 * Returns a 64-character hex string.
 */
export function hashPin(pin: string): string {
  return createHash('sha256').update(pin + PIN_SALT).digest('hex');
}

/**
 * Check if a stored PIN value is already hashed (64 hex chars) or plain text (4 digits).
 */
export function isPinHashed(storedPin: string): boolean {
  return storedPin.length === 64 && /^[a-f0-9]+$/.test(storedPin);
}
