export function formatErrorMsg(err: unknown, defaultMessage: string = 'An unexpected system error occurred.'): string {
  let msg = '';
  if (err instanceof Error) {
    msg = err.message;
  } else if (typeof err === 'string') {
    msg = err;
  } else if (err && typeof err === 'object' && 'message' in err) {
    msg = String((err as any).message);
  }

  if (!msg) return defaultMessage;

  // Mask Electron/IPC wrapper text
  if (msg.includes("Error invoking remote method")) {
    const match = msg.match(/Error: (.*)$/);
    if (match && match[1]) {
      msg = match[1].trim();
    } else {
      msg = msg.split(':').slice(2).join(':').trim() || msg;
    }
  }

  const lowerMsg = msg.toLowerCase();
  
  // Mask SQLite production errors
  if (lowerMsg.includes('unique constraint failed') || lowerMsg.includes('sqlite_constraint: unique')) {
    if (lowerMsg.includes('users.pin')) return 'This PIN is already in use by another staff member.';
    if (lowerMsg.includes('customers.phone')) return 'A customer with this phone number already exists.';
    if (lowerMsg.includes('products.barcode')) return 'A product with this barcode already exists.';
    return 'This entry already exists in the system.';
  }

  if (lowerMsg.includes('foreign key constraint failed') || lowerMsg.includes('sqlite_constraint_foreignkey')) {
    return 'This record cannot be deleted because it is tied to historical data (e.g., past sales or logs).';
  }
  
  if (lowerMsg.includes('sqlite_') || lowerMsg.includes('database is locked') || lowerMsg.includes('sql logic error')) {
    return 'The database is currently busy or encountered an issue. Please try again.';
  }

  if (
    lowerMsg.includes('network error') ||
    lowerMsg.includes('failed to fetch') ||
    lowerMsg.includes('econnrefused') ||
    lowerMsg.includes('sending request for url') ||
    lowerMsg.includes('backboard.railway')
  ) {
    return 'Connection issue. Please check your internet, VPN/firewall, or try again in a few minutes.';
  }

  return msg || defaultMessage;
}
