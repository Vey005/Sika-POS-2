import { ipcMain, Notification } from 'electron';
import { SecureStore } from '../store/secure-store';

let secureStoreRef: SecureStore | null = null;

export function registerNotificationHandlers(secureStore?: SecureStore) {
  if (secureStore) secureStoreRef = secureStore;

  ipcMain.handle('notifications:show', (event, { title, body, data }) => {
    const notification = new Notification({
      title,
      body,
    });

    if (data) {
      notification.on('click', () => {
        event.sender.send('notification:click', data);
      });
    }

    notification.show();
    return { success: true };
  });

  ipcMain.handle('notifications:sendOfficial', async (_event, to: string, message: string) => {
    const axios = require('axios');
    const { GATEWAY_CONFIG } = require('../gatewayConfig');

    // Read API key from encrypted SecureStore (never from source code)
    if (!secureStoreRef) {
      console.error('[SMS] SecureStore not initialized. Cannot send SMS.');
      return { success: false, message: 'SMS gateway unavailable.' };
    }

    const apiKey = secureStoreRef.get('mnotify_api_key');
    const senderId = GATEWAY_CONFIG.MNOTIFY_SENDER_ID || 'SIKA POS';
    const isApproved = GATEWAY_CONFIG.SENDER_ID_APPROVED;

    if (!apiKey || !isApproved) {
      console.log('[SMS] Gateway not ready (approved:', isApproved, '| keySet:', !!apiKey, ')');
      return { success: false, message: 'SMS Gateway pending approval. Using WhatsApp.' };
    }

    // Validate inputs
    if (!to || typeof to !== 'string' || to.trim().length < 9) {
      return { success: false, message: 'Invalid phone number.' };
    }
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return { success: false, message: 'Message cannot be empty.' };
    }

    // Clean phone number: strip non-digits, convert local 0XX to 233XX
    let phone = to.replace(/\D/g, '');
    if (phone.startsWith('0') && phone.length === 10) {
      phone = '233' + phone.substring(1);
    }

    console.log(`[SMS] Sending to: ${phone} | Sender: ${senderId}`);

    // Try the NEW API first (api.mnotify.com), fall back to Legacy (apps.mnotify.net)
    try {
      // ── Attempt 1: New MNotify API (POST) ──
      const newApiRes = await axios.post(
        `https://api.mnotify.com/api/sms/quick?key=${apiKey}`,
        {
          recipient: [phone],
          sender: senderId,
          message: message,
          is_schedule: false,
        },
        { timeout: 15000 }
      );

      console.log('[SMS] New API response:', JSON.stringify(newApiRes.data));

      if (
        newApiRes.data?.status === 'success' ||
        newApiRes.data?.code === '2000' ||
        newApiRes.data?.code === 2000
      ) {
        console.log('[SMS] ✅ Sent successfully via New API!');
        return { success: true };
      }

      console.warn('[SMS] New API returned non-success:', newApiRes.data?.message || newApiRes.data);
    } catch (newApiErr: any) {
      console.warn('[SMS] New API failed:', newApiErr.response?.data?.message || newApiErr.message);
    }

    // ── Attempt 2: Legacy MNotify API (GET) ──
    try {
      const legacyRes = await axios.get('https://apps.mnotify.net/smsapi', {
        params: {
          key: apiKey,
          to: phone,
          msg: message,
          sender_id: senderId,
        },
        timeout: 15000,
      });

      console.log('[SMS] Legacy API response:', legacyRes.data);

      if (String(legacyRes.data).trim() === '1000') {
        console.log('[SMS] ✅ Sent successfully via Legacy API!');
        return { success: true };
      }

      const legacyError = typeof legacyRes.data === 'object'
        ? (legacyRes.data.message || legacyRes.data.error || JSON.stringify(legacyRes.data))
        : String(legacyRes.data);

      console.error('[SMS] ❌ Legacy API failed:', legacyError);
      return { success: false, message: legacyError };
    } catch (legacyErr: any) {
      const errMsg = legacyErr.response?.data?.message || legacyErr.message;
      console.error('[SMS] ❌ Both APIs failed. Last error:', errMsg);
      return { success: false, message: errMsg };
    }
  });
}
