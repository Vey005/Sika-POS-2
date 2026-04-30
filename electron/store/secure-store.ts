import Store from 'electron-store';
import { safeStorage } from 'electron';
import { createHash } from 'crypto';
import * as os from 'os';

interface AppConfig {
  tenant_token?: string;
  access_token?: string;
  printerDeviceId?: string;
  mnotify_api_key?: string;
  pin_salt?: string;
  is_activated?: string;
  license_key?: string;
  business_name?: string;
  setup_complete?: string;
  business_logo?: string;
  [key: string]: any;
}

export class SecureStore {
  private store: Store<AppConfig>;

  constructor() {
    const encryptionKey = createHash('sha256')
      .update(`sikapos-secure-${os.hostname()}-${os.userInfo().username}-v2`)
      .digest('hex')
      .substring(0, 32);

    let oldData: AppConfig | null = null;
    try {
      const oldStore = new Store<AppConfig>({
        name: 'sikapos-config',
        encryptionKey: 'sika-pos-secure-key-2024',
        clearInvalidConfig: false
      });
      const oldAll = oldStore.store;
      // Check if there's real data in the old store
      if (oldAll && Object.keys(oldAll).length > 0 && (oldAll.is_activated || oldAll.license_key)) {
        oldData = oldAll;
        console.log('[SecureStore] Found data from previous encryption. Will migrate.');
      }
    } catch {
      // Old store unreadable — that's fine, it may already be migrated
    }

    const storeOptions = {
      name: 'sikapos-config-v2', // New filename to avoid conflicts during migration
      encryptionKey,
      clearInvalidConfig: true,
    };

    if (!safeStorage.isEncryptionAvailable()) {
      console.warn('[SecureStore] OS encryption NOT available. Falling back to derived encryption key.');
    } else {
      console.log('[SecureStore] Using machine-derived encryption key.');
    }

    this.store = new Store<AppConfig>(storeOptions);

    // Migrate old data if found and new store is empty
    if (oldData && Object.keys(this.store.store).length === 0) {
      for (const [key, value] of Object.entries(oldData)) {
        this.store.set(key as keyof AppConfig, value);
      }
      console.log(`[SecureStore] Migrated ${Object.keys(oldData).length} keys to new encryption.`);
    }
  }

  public get(key: keyof AppConfig): any {
    return this.store.get(key);
  }

  public set(key: keyof AppConfig, value: any): void {
    this.store.set(key, value);
  }

  public delete(key: keyof AppConfig): void {
    this.store.delete(key);
  }

  public getAll(): AppConfig {
    return this.store.store;
  }
}
