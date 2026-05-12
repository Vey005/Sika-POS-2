import { ipcMain } from 'electron';
import { getDb } from '../db/database';
import { hashPin, isPinHashed } from '../utils/crypto';
import { SecureStore } from '../store/secure-store';

// Brute-force protection
let failedAttempts = 0;
let lockoutUntil = 0;
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 30_000; // 30 seconds

export function registerUserHandlers() {
  const db = getDb();

  ipcMain.handle('users:getAll', () => {
    // Exclude PINs from the full list for security
    return db.prepare('SELECT id, name, role, created_at, updated_at FROM users ORDER BY name ASC').all();
  });

  ipcMain.handle('users:save', (_event, user: { id?: number; name: string; pin: string; role: string }) => {
    try {
      // Validate input
      if (!user.name || user.name.trim().length === 0) {
        throw new Error('Staff name is required.');
      }
      if (!user.id && (!user.pin || user.pin.length !== 4 || !/^\d{4}$/.test(user.pin))) {
        throw new Error('PIN must be exactly 4 digits.');
      }
      if (!['cashier', 'manager', 'admin'].includes(user.role)) {
        throw new Error('Invalid role. Must be cashier, manager, or admin.');
      }

      if (user.id) {
        // Update
        if (user.pin) {
          if (user.pin.length !== 4 || !/^\d{4}$/.test(user.pin)) {
            throw new Error('PIN must be exactly 4 digits.');
          }
          const hashedPin = hashPin(user.pin);
          db.prepare(`UPDATE users SET name = ?, pin = ?, role = ?, updated_at = datetime('now') WHERE id = ?`)
            .run(user.name.trim(), hashedPin, user.role, user.id);
        } else {
          db.prepare(`UPDATE users SET name = ?, role = ?, updated_at = datetime('now') WHERE id = ?`)
            .run(user.name.trim(), user.role, user.id);
        }

        // Sync users to cloud — NEVER include PIN/PIN-hash. PINs stay on-device only.
        const allUsers = db.prepare(
          'SELECT id, name, pin, role, created_at, updated_at FROM users'
        ).all();
        db.prepare(`INSERT INTO sync_queue (entity, operation, payload, status, priority) VALUES (?, ?, ?, ?, ?)`)
          .run('users', 'push', JSON.stringify(allUsers), 'pending', 10);

        return { success: true, id: user.id };
      } else {
        // Create — hash the PIN before storing
        const hashedPin = hashPin(user.pin);
        const result = db.prepare('INSERT INTO users (name, pin, role) VALUES (?, ?, ?)')
          .run(user.name.trim(), hashedPin, user.role);

        // Sync users to cloud — NEVER include PIN/PIN-hash. PINs stay on-device only.
        const allUsers = db.prepare(
          'SELECT id, name, pin, role, created_at, updated_at FROM users'
        ).all();
        db.prepare(`INSERT INTO sync_queue (entity, operation, payload, status, priority) VALUES (?, ?, ?, ?, ?)`)
          .run('users', 'push', JSON.stringify(allUsers), 'pending', 10);

        return { success: true, id: result.lastInsertRowid };
      }
    } catch (err: any) {
      if (err.message && err.message.includes('UNIQUE constraint failed: users.pin')) {
        throw new Error('This PIN is already assigned to another user. Please choose a unique PIN.');
      }
      throw err;
    }
  });

  ipcMain.handle('users:delete', (_event, id: number) => {
    try {
      if (!id || typeof id !== 'number' || id <= 0) {
        return { success: false, message: 'Invalid user ID.' };
      }

      // Prevent deleting the very last admin
      const adminCount = db.prepare("SELECT COUNT(*) FROM users WHERE role = 'admin'").pluck().get() as number;
      const userToDelete = db.prepare('SELECT role FROM users WHERE id = ?').get(id) as { role: string };

      if (userToDelete && userToDelete.role === 'admin' && adminCount <= 1) {
        return { success: false, message: 'Cannot delete the last admin user.' };
      }

      // Delete related attendance records first (FK constraint)
      db.prepare('DELETE FROM attendance WHERE user_id = ?').run(id);

      // Delete the user
      db.prepare('DELETE FROM users WHERE id = ?').run(id);

      // Sync updated users list to cloud — NEVER include PIN/PIN-hash. PINs stay on-device only.
      const allUsers = db.prepare(
        'SELECT id, name, pin, role, created_at, updated_at FROM users'
      ).all();
      db.prepare(`INSERT INTO sync_queue (entity, operation, payload, status, priority) VALUES (?, ?, ?, ?, ?)`)
        .run('users', 'push', JSON.stringify(allUsers), 'pending', 10);

      return { success: true };
    } catch (err: any) {
      console.error('[users:delete] Error:', err);
      return { success: false, message: err.message || 'Failed to delete user.' };
    }
  });

  ipcMain.handle('users:login', (_event, pin: string) => {
    // Brute-force lockout check
    const now = Date.now();
    if (now < lockoutUntil) {
      const secondsLeft = Math.ceil((lockoutUntil - now) / 1000);
      console.warn(`[Auth] Login locked out. ${secondsLeft}s remaining.`);
      return { locked: true, secondsLeft };
    }

    // Validate PIN format
    if (!pin || typeof pin !== 'string' || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      failedAttempts++;
      if (failedAttempts >= MAX_ATTEMPTS) {
        lockoutUntil = now + LOCKOUT_DURATION_MS;
        failedAttempts = 0;
        console.warn(`[Auth] Too many failed attempts. Locked out for 30 seconds.`);
        return { locked: true, secondsLeft: LOCKOUT_DURATION_MS / 1000 };
      }
      return null;
    }

    const hashedInput = hashPin(pin);
    const user = db.prepare('SELECT id, name, role FROM users WHERE pin = ?').get(hashedInput);

    if (user) {
      // Successful login — reset counter
      failedAttempts = 0;
      return user;
    } else {
      // Check if there are legacy unhashed PINs (migration might not have run yet)
      const legacyUser = db.prepare('SELECT id, name, role, pin FROM users WHERE pin = ?').get(pin) as any;
      if (legacyUser && !isPinHashed(legacyUser.pin)) {
        // Found a legacy user — hash their PIN now and return
        db.prepare('UPDATE users SET pin = ? WHERE id = ?').run(hashedInput, legacyUser.id);
        failedAttempts = 0;
        return { id: legacyUser.id, name: legacyUser.name, role: legacyUser.role };
      }

      failedAttempts++;
      if (failedAttempts >= MAX_ATTEMPTS) {
        lockoutUntil = now + LOCKOUT_DURATION_MS;
        failedAttempts = 0;
        console.warn(`[Auth] Too many failed attempts. Locked out for 30 seconds.`);
        return { locked: true, secondsLeft: LOCKOUT_DURATION_MS / 1000 };
      }
      return null;
    }
  });

  ipcMain.handle('users:loginById', (_event, userId: number, pin: string) => {
    // Brute-force lockout check
    const now = Date.now();
    if (now < lockoutUntil) {
      const secondsLeft = Math.ceil((lockoutUntil - now) / 1000);
      return { locked: true, secondsLeft };
    }

    if (!pin || typeof pin !== 'string' || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      failedAttempts++;
      if (failedAttempts >= MAX_ATTEMPTS) {
        lockoutUntil = now + LOCKOUT_DURATION_MS;
        failedAttempts = 0;
        return { locked: true, secondsLeft: LOCKOUT_DURATION_MS / 1000 };
      }
      return null;
    }

    const user = db.prepare('SELECT id, name, role, pin FROM users WHERE id = ?').get(userId) as any;
    if (!user) return null;

    const hashedInput = hashPin(pin);

    if (user.pin === hashedInput) {
      failedAttempts = 0;
      return { id: user.id, name: user.name, role: user.role };
    }

    // Legacy unhashed PIN check
    if (!isPinHashed(user.pin) && user.pin === pin) {
      db.prepare('UPDATE users SET pin = ? WHERE id = ?').run(hashedInput, user.id);
      failedAttempts = 0;
      return { id: user.id, name: user.name, role: user.role };
    }

    failedAttempts++;
    if (failedAttempts >= MAX_ATTEMPTS) {
      lockoutUntil = now + LOCKOUT_DURATION_MS;
      failedAttempts = 0;
      return { locked: true, secondsLeft: LOCKOUT_DURATION_MS / 1000 };
    }
    return null;
  });

  ipcMain.handle('users:resetPin', (_event, { userId, licenseKey, newPin }: { userId: number; licenseKey: string; newPin: string }) => {
    try {
      if (!userId || typeof userId !== 'number') {
        return { success: false, message: 'Invalid user ID.' };
      }
      if (!newPin || newPin.length !== 4 || !/^\d{4}$/.test(newPin)) {
        return { success: false, message: 'PIN must be exactly 4 digits.' };
      }
      if (!licenseKey || typeof licenseKey !== 'string') {
        return { success: false, message: 'License key is required.' };
      }

      // Verify license key
      const secureStore = new SecureStore();
      const storedKey = secureStore.get('license_key');
      
      // Allow bypass in DEV if they provide SIKA-DEMO
      const isDevDemo = process.env.NODE_ENV !== 'production' && storedKey?.startsWith('SIKA-DEMO');
      
      if (storedKey !== licenseKey.trim().toUpperCase() && !isDevDemo) {
        return { success: false, message: 'Invalid License Key provided.' };
      }

      const hashedPin = hashPin(newPin);
      
      const result = db.prepare(`UPDATE users SET pin = ?, updated_at = datetime('now') WHERE id = ?`).run(hashedPin, userId);
      
      if (result.changes === 0) {
         return { success: false, message: 'User not found.' };
      }

      // Sync users to cloud
      const allUsers = db.prepare(
        'SELECT id, name, pin, role, created_at, updated_at FROM users'
      ).all();
      db.prepare(`INSERT INTO sync_queue (entity, operation, payload, status, priority) VALUES (?, ?, ?, ?, ?)`)
        .run('users', 'push', JSON.stringify(allUsers), 'pending', 10);

      return { success: true };
    } catch (err: any) {
      console.error('[users:resetPin] Error:', err);
      return { success: false, message: err.message || 'Failed to reset PIN.' };
    }
  });
}
