// Gateway configuration — credentials are stored in SecureStore at runtime.
// This file only contains non-secret configuration.
export const GATEWAY_CONFIG = {
  MNOTIFY_SENDER_ID: 'SIKA POS',
  SENDER_ID_APPROVED: false, // Change to true once MNotify approves your sender ID
};

// The API key is stored securely via SecureStore (set during app initialization in main.ts).
// To update the API key, change it in the initializeGateway() function in main.ts.
