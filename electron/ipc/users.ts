import { ipcMain } from 'electron';
import { getDb } from '../db/database';
<<<<<<< HEAD
import { hashPassword, isPasswordHashed } from '../utils/crypto';
import { SecureStore } from '../store/secure-store';

function hasOwnNavPayload(user: object): user is { cashier_nav_visibility: string | null | undefined } {
  return Object.prototype.hasOwnProperty.call(user, 'cashier_nav_visibility');
}

=======
import { hashPin, isPinHashed } from '../utils/crypto';
import { SecureStore } from '../store/secure-store';

>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
// Brute-force protection
let failedAttempts = 0;
let lockoutUntil = 0;
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 30_000; // 30 seconds

export function registerUserHandlers() {
  const db = getDb();

  ipcMain.handle('users:getAll', () => {
<<<<<<< HEAD
    // Exclude passwords from the full list for security
    return db.prepare(
      'SELECT id, name, role, created_at, updated_at, cashier_nav_visibility FROM users ORDER BY name ASC'
    ).all();
  });

  ipcMain.handle('users:getById', (_event, id: number) => {
    const row = db.prepare(
      'SELECT id, name, role, cashier_nav_visibility FROM users WHERE id = ?'
    ).get(id) as { id: number; name: string; role: string; cashier_nav_visibility: string | null } | undefined;
    return row ?? null;
  });

  ipcMain.handle('users:save', (_event, user: {
    id?: number;
    name: string;
    password?: string;
    pin?: string;
    role: string;
    cashier_nav_visibility?: string | null;
  }) => {
    try {
      const incomingPassword = (user.password ?? user.pin ?? '').trim();

=======
    // Exclude PINs from the full list for security
    return db.prepare('SELECT id, name, role, created_at, updated_at FROM users ORDER BY name ASC').all();
  });

  ipcMain.handle('users:save', (_event, user: { id?: number; name: string; pin: string; role: string }) => {
    try {
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
      // Validate input
      if (!user.name || user.name.trim().length === 0) {
        throw new Error('Staff name is required.');
      }
<<<<<<< HEAD
      if (!user.id && (!incomingPassword || incomingPassword.length < 4)) {
        throw new Error('Password must be at least 4 characters.');
=======
      if (!user.id && (!user.pin || user.pin.length !== 4 || !/^\d{4}$/.test(user.pin))) {
        throw new Error('PIN must be exactly 4 digits.');
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
      }
      if (!['cashier', 'manager', 'admin'].includes(user.role)) {
        throw new Error('Invalid role. Must be cashier, manager, or admin.');
      }

      if (user.id) {
<<<<<<< HEAD
        const prev = db.prepare('SELECT cashier_nav_visibility FROM users WHERE id = ?').get(user.id) as
          | { cashier_nav_visibility: string | null }
          | undefined;
        const nextNav = hasOwnNavPayload(user)
          ? user.cashier_nav_visibility ?? null
          : prev?.cashier_nav_visibility ?? null;

        // Update
        if (incomingPassword) {
          if (incomingPassword.length < 4) {
            throw new Error('Password must be at least 4 characters.');
          }
          const hashedPassword = hashPassword(incomingPassword);
          db.prepare(
            `UPDATE users SET name = ?, pin = ?, role = ?, cashier_nav_visibility = ?, updated_at = datetime('now') WHERE id = ?`
          ).run(user.name.trim(), hashedPassword, user.role, nextNav, user.id);
        } else {
          db.prepare(
            `UPDATE users SET name = ?, role = ?, cashier_nav_visibility = ?, updated_at = datetime('now') WHERE id = ?`
          ).run(user.name.trim(), user.role, nextNav, user.id);
        }

        // Sync users to cloud
=======
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
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
        const allUsers = db.prepare(
          'SELECT id, name, pin, role, created_at, updated_at FROM users'
        ).all();
        db.prepare(`INSERT INTO sync_queue (entity, operation, payload, status, priority) VALUES (?, ?, ?, ?, ?)`)
          .run('users', 'push', JSON.stringify(allUsers), 'pending', 10);

        return { success: true, id: user.id };
      } else {
<<<<<<< HEAD
        // Create — hash the password before storing
        const hashedPassword = hashPassword(incomingPassword);
        const insertNav = hasOwnNavPayload(user) ? user.cashier_nav_visibility ?? null : null;
        const result = db.prepare('INSERT INTO users (name, pin, role, cashier_nav_visibility) VALUES (?, ?, ?, ?)')
          .run(user.name.trim(), hashedPassword, user.role, insertNav);

        // Sync users to cloud
=======
        // Create — hash the PIN before storing
        const hashedPin = hashPin(user.pin);
        const result = db.prepare('INSERT INTO users (name, pin, role) VALUES (?, ?, ?)')
          .run(user.name.trim(), hashedPin, user.role);

        // Sync users to cloud — NEVER include PIN/PIN-hash. PINs stay on-device only.
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
        const allUsers = db.prepare(
          'SELECT id, name, pin, role, created_at, updated_at FROM users'
        ).all();
        db.prepare(`INSERT INTO sync_queue (entity, operation, payload, status, priority) VALUES (?, ?, ?, ?, ?)`)
          .run('users', 'push', JSON.stringify(allUsers), 'pending', 10);

        return { success: true, id: result.lastInsertRowid };
      }
    } catch (err: any) {
<<<<<<< HEAD
=======
      if (err.message && err.message.includes('UNIQUE constraint failed: users.pin')) {
        throw new Error('This PIN is already assigned to another user. Please choose a unique PIN.');
      }
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
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

<<<<<<< HEAD
      // Sync updated users list to cloud
=======
      // Sync updated users list to cloud — NEVER include PIN/PIN-hash. PINs stay on-device only.
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
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

<<<<<<< HEAD
  ipcMain.handle('users:login', (_event, password: string) => {
=======
  ipcMain.handle('users:login', (_event, pin: string) => {
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
    // Brute-force lockout check
    const now = Date.now();
    if (now < lockoutUntil) {
      const secondsLeft = Math.ceil((lockoutUntil - now) / 1000);
      console.warn(`[Auth] Login locked out. ${secondsLeft}s remaining.`);
      return { locked: true, secondsLeft };
    }

<<<<<<< HEAD
    // Validate password
    if (!password || typeof password !== 'string' || password.length < 1) {
=======
    // Validate PIN format
    if (!pin || typeof pin !== 'string' || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
      failedAttempts++;
      if (failedAttempts >= MAX_ATTEMPTS) {
        lockoutUntil = now + LOCKOUT_DURATION_MS;
        failedAttempts = 0;
        console.warn(`[Auth] Too many failed attempts. Locked out for 30 seconds.`);
        return { locked: true, secondsLeft: LOCKOUT_DURATION_MS / 1000 };
      }
      return null;
    }

<<<<<<< HEAD
    const hashedInput = hashPassword(password);
=======
    const hashedInput = hashPin(pin);
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
    const user = db.prepare('SELECT id, name, role FROM users WHERE pin = ?').get(hashedInput);

    if (user) {
      // Successful login — reset counter
      failedAttempts = 0;
      return user;
    } else {
<<<<<<< HEAD
      // Check if there are legacy unhashed passwords (migration might not have run yet)
      const legacyUser = db.prepare('SELECT id, name, role, pin FROM users WHERE pin = ?').get(password) as any;
      if (legacyUser && !isPasswordHashed(legacyUser.pin)) {
        // Found a legacy user — hash their password now and return
=======
      // Check if there are legacy unhashed PINs (migration might not have run yet)
      const legacyUser = db.prepare('SELECT id, name, role, pin FROM users WHERE pin = ?').get(pin) as any;
      if (legacyUser && !isPinHashed(legacyUser.pin)) {
        // Found a legacy user — hash their PIN now and return
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
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

<<<<<<< HEAD
  ipcMain.handle('users:loginById', (_event, userId: number, password: string) => {
=======
  ipcMain.handle('users:loginById', (_event, userId: number, pin: string) => {
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
    // Brute-force lockout check
    const now = Date.now();
    if (now < lockoutUntil) {
      const secondsLeft = Math.ceil((lockoutUntil - now) / 1000);
      return { locked: true, secondsLeft };
    }

<<<<<<< HEAD
    if (!password || typeof password !== 'string' || password.length < 1) {
=======
    if (!pin || typeof pin !== 'string' || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
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

<<<<<<< HEAD
    const hashedInput = hashPassword(password);
=======
    const hashedInput = hashPin(pin);
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf

    if (user.pin === hashedInput) {
      failedAttempts = 0;
      return { id: user.id, name: user.name, role: user.role };
    }

<<<<<<< HEAD
    // Legacy unhashed password check
    if (!isPasswordHashed(user.pin) && user.pin === password) {
=======
    // Legacy unhashed PIN check
    if (!isPinHashed(user.pin) && user.pin === pin) {
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
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

<<<<<<< HEAD
  // Keep backward-compatible 'users:resetPin' handler as well
  const resetHandler = (_event: any, data: { userId: number; licenseKey: string; newPassword?: string; newPin?: string }) => {
    try {
      const { userId, licenseKey } = data;
      const nextPassword = (data.newPassword ?? data.newPin ?? '').trim();

      if (!userId || typeof userId !== 'number') {
        return { success: false, message: 'Invalid user ID.' };
      }
      if (!nextPassword || nextPassword.length < 4) {
        return { success: false, message: 'Password must be at least 4 characters.' };
=======
  ipcMain.handle('users:resetPin', (_event, { userId, licenseKey, newPin }: { userId: number; licenseKey: string; newPin: string }) => {
    try {
      if (!userId || typeof userId !== 'number') {
        return { success: false, message: 'Invalid user ID.' };
      }
      if (!newPin || newPin.length !== 4 || !/^\d{4}$/.test(newPin)) {
        return { success: false, message: 'PIN must be exactly 4 digits.' };
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
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

<<<<<<< HEAD
      const hashedPassword = hashPassword(nextPassword);
      
      const result = db.prepare(`UPDATE users SET pin = ?, updated_at = datetime('now') WHERE id = ?`).run(hashedPassword, userId);
=======
      const hashedPin = hashPin(newPin);
      
      const result = db.prepare(`UPDATE users SET pin = ?, updated_at = datetime('now') WHERE id = ?`).run(hashedPin, userId);
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
      
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
<<<<<<< HEAD
      console.error('[users:resetPassword] Error:', err);
      return { success: false, message: err.message || 'Failed to reset password.' };
    }
  };

  ipcMain.handle('users:resetPin', resetHandler);
  ipcMain.handle('users:resetPassword', resetHandler);
=======
      console.error('[users:resetPin] Error:', err);
      return { success: false, message: err.message || 'Failed to reset PIN.' };
    }
  });
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
}
