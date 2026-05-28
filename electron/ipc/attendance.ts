import { ipcMain } from 'electron';
import { getDb } from '../db/database';

export function registerAttendanceHandlers() {
  const db = getDb();

  ipcMain.handle('attendance:clockIn', (_event, userId: number) => {
    const res = db.prepare(`
      INSERT INTO attendance (user_id, type) VALUES (?, 'in')
    `).run(userId);
    
    // Fetch the inserted record to sync
    const record = db.prepare('SELECT * FROM attendance WHERE id = ?').get(res.lastInsertRowid) as any;
    if (record) {
      db.prepare(`
        INSERT INTO sync_queue (entity, operation, payload, status, priority)
        VALUES ('attendance', 'push', ?, 'pending', 10)
      `).run(JSON.stringify({ ...record, local_id: record.id }));
    }
    return res;
  });

  ipcMain.handle('attendance:clockOut', (_event, userId: number) => {
    const res = db.prepare(`
      INSERT INTO attendance (user_id, type) VALUES (?, 'out')
    `).run(userId);

    // Fetch the inserted record to sync
    const record = db.prepare('SELECT * FROM attendance WHERE id = ?').get(res.lastInsertRowid) as any;
    if (record) {
      db.prepare(`
        INSERT INTO sync_queue (entity, operation, payload, status, priority)
        VALUES ('attendance', 'push', ?, 'pending', 10)
      `).run(JSON.stringify({ ...record, local_id: record.id }));
    }
    return res;
  });

  ipcMain.handle('attendance:getStatus', (_event, userId: number) => {
    return db.prepare(`
      SELECT * FROM attendance 
      WHERE user_id = ? 
      ORDER BY created_at DESC 
      LIMIT 1
    `).get(userId);
  });

  ipcMain.handle('attendance:getHistory', (_event, userId?: number, range?: { from?: string; to?: string }) => {
    let sql = `
      SELECT 
        a.id,
        a.user_id,
        u.name as user_name,
        a.created_at as clock_in,
        (
          SELECT a2.created_at 
          FROM attendance a2 
          WHERE a2.user_id = a.user_id 
            AND a2.type = 'out' 
            AND a2.created_at > a.created_at 
          ORDER BY a2.created_at ASC 
          LIMIT 1
        ) as clock_out
      FROM attendance a
      JOIN users u ON a.user_id = u.id
      WHERE a.type = 'in'
    `;
    const params: any[] = [];

    if (userId) {
      sql += " AND a.user_id = ?";
      params.push(userId);
    }

    if (range?.from) {
      sql += " AND a.created_at >= ?";
      params.push(`${range.from} 00:00:00`);
    }
    if (range?.to) {
      sql += " AND a.created_at <= ?";
      params.push(`${range.to} 23:59:59`);
    }

    sql += " ORDER BY a.created_at DESC";
    return db.prepare(sql).all(...params);
  });
}
