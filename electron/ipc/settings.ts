import { ipcMain } from 'electron';
import { getDb } from '../db/database';

export function registerSettingsHandlers() {
  const db = getDb();

  ipcMain.handle('settings:get', (_event, key: string) => {
    const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as { value: string } | undefined;
    return row ? row.value : null;
  });

  // Only allow known setting keys to prevent arbitrary overwrite
  const ALLOWED_KEYS = new Set([
    'business_name', 'business_address', 'business_phone', 'cashier_name',
    'receipt_footer', 'tin', 'pin', 'currency', 'owner_whatsapp',
    'notification_provider', 'sms_sender_id', 'theme'
  ]);

  ipcMain.handle('settings:set', (_event, key: string, value: unknown) => {
    if (!ALLOWED_KEYS.has(key)) {
      console.warn(`[Settings] Blocked attempt to set unknown key: ${key}`);
      return { success: false, message: 'Setting key not allowed.' };
    }
    const strVal = typeof value === 'string' ? value : JSON.stringify(value);
    db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
    `).run(key, strVal);
    return { success: true };
  });

  ipcMain.handle('settings:getAll', (_event) => {
    const rows = db.prepare(`SELECT key, value FROM settings`).all() as Array<{ key: string; value: string }>;
    const result: Record<string, string> = {};
    for (const row of rows) result[row.key] = row.value;
    return result;
  });

  ipcMain.handle('settings:setBusiness', (_event, data: {
    business_name: string;
    business_address: string;
    business_phone: string;
    cashier_name: string;
    receipt_footer: string;
    tin?: string;
    owner_whatsapp?: string;
    notification_provider?: string;
    sms_api_key?: string;
    sms_sender_id?: string;
  }) => {
    const setSetting = db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
    `);
    const setAll = db.transaction(() => {
      setSetting.run('business_name', data.business_name);
      setSetting.run('business_address', data.business_address);
      setSetting.run('business_phone', data.business_phone);
      setSetting.run('cashier_name', data.cashier_name);
      setSetting.run('receipt_footer', data.receipt_footer);
      if (data.tin) setSetting.run('tin', data.tin);
      if (data.owner_whatsapp) setSetting.run('owner_whatsapp', data.owner_whatsapp);
      if (data.notification_provider) setSetting.run('notification_provider', data.notification_provider);
      if (data.sms_api_key) setSetting.run('sms_api_key', data.sms_api_key);
      if (data.sms_sender_id) setSetting.run('sms_sender_id', data.sms_sender_id);
    });
    setAll();
    return { success: true };
  });

  ipcMain.handle('settings:getBusiness', (_event) => {
    // Deliberately exclude sms_api_key — sensitive credentials should not be sent to the renderer
    const rows = db.prepare(`
      SELECT key, value FROM settings
      WHERE key IN ('business_name','business_address','business_phone','cashier_name','receipt_footer','tin','pin','currency','owner_whatsapp','notification_provider','sms_sender_id')
    `).all() as Array<{ key: string; value: string }>;
    const result: Record<string, string> = {};
    for (const row of rows) result[row.key] = row.value;
    return result;
  });
}
