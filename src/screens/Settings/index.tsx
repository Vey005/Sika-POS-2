import { useState, useEffect } from 'react';
import { useAuthStore } from '../../store/auth';
import { CLOUD_SERVER_URL } from '../../config';
import styles from './Settings.module.css';

type Tab = 'business' | 'staff' | 'hardware' | 'cloud' | 'about';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'business', label: 'Business', icon: '🏢' },
  { id: 'staff', label: 'Staff', icon: '👥' },
  { id: 'hardware', label: 'Hardware', icon: '🖨️' },
  { id: 'cloud', label: 'Cloud & Data', icon: '☁️' },
  { id: 'about', label: 'About', icon: 'ℹ️' },
];

export default function SettingsScreen() {
  const { setBusinessInfo, businessLogo, setBusinessLogo } = useAuthStore();
  const [activeTab, setActiveTab] = useState<Tab>('business');
  const [settings, setSettings] = useState({
    business_name: '',
    business_address: '',
    business_phone: '',
    cashier_name: '',
    receipt_footer: '',
    tin: '',
    printerDeviceId: '',
    owner_whatsapp: '',
    notification_provider: 'whatsapp',
    sms_api_key: '',
    sms_sender_id: '',
  });
  const [printers, setPrinters] = useState<Array<{ id: string; name: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [savingInventory, setSavingInventory] = useState(false);
  const [saved, setSaved] = useState(false);

  const [staff, setStaff] = useState<Array<{ id: number; name: string; role: string; created_at: string }>>([]);
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState<{ id?: number; name: string; pin: string; role: string } | null>(null);
  const [staffError, setStaffError] = useState('');
  const { user } = useAuthStore();

  useEffect(() => {
    if (!window.sikapos) return;
    window.sikapos.settings.getBusiness().then(biz => {
      setSettings(s => ({
        ...s,
        business_name: biz.business_name || '',
        business_address: biz.business_address || '',
        business_phone: biz.business_phone || '',
        cashier_name: biz.cashier_name || '',
        receipt_footer: biz.receipt_footer || '',
        tin: biz.tin || '',
        owner_whatsapp: biz.owner_whatsapp || '',
        notification_provider: biz.notification_provider || 'whatsapp',
        sms_api_key: biz.sms_api_key || '',
        sms_sender_id: biz.sms_sender_id || '',
      }));
    });
    if (window.sikapos.printer) {
      window.sikapos.printer.listPrinters().then(setPrinters);
    }
    window.sikapos.secureStore.get('printerDeviceId').then((val: any) => {
      if (val) setSettings(s => ({ ...s, printerDeviceId: val }));
    });
    loadStaff();
  }, []);

  const loadStaff = async () => {
    if (window.sikapos?.users) {
      const users = await window.sikapos.users.getAll();
      setStaff(users);
    }
  };

  const handleSave = async () => {
    if (!window.sikapos) return;
    setSaving(true); setSaved(false);
    try {
      await window.sikapos.settings.setBusiness({
        business_name: settings.business_name,
        business_address: settings.business_address,
        business_phone: settings.business_phone,
        cashier_name: settings.cashier_name,
        receipt_footer: settings.receipt_footer,
        tin: settings.tin,
        owner_whatsapp: settings.owner_whatsapp,
        notification_provider: settings.notification_provider as 'whatsapp' | 'sms',
        sms_api_key: settings.sms_api_key,
        sms_sender_id: settings.sms_sender_id,
      });
      await window.sikapos.secureStore.set('printerDeviceId', settings.printerDeviceId);
      setBusinessInfo(settings.business_name);
      useAuthStore.getState().setReceiptFooter(settings.receipt_footer);

      // --- Sync Business Name to Cloud Portal ---
      const licenseKey = await window.sikapos?.secureStore.get('license_key');
      if (licenseKey && !licenseKey.startsWith('SIKA-DEMO')) {
        try {
          await fetch(`${CLOUD_SERVER_URL}/v1/licenses/update-name`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${licenseKey}`
            },
            body: JSON.stringify({ license_key: licenseKey, business_name: settings.business_name })
          });
          console.log('[Settings] Cloud business name updated successfully.');
        } catch (e) {
          console.warn('[Settings] Failed to sync business name to cloud.', e);
        }
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveStaff = async () => {
    if (!editingStaff) return;
    setStaffError('');
    if (!editingStaff.name || (!editingStaff.id && (!editingStaff.pin || editingStaff.pin.length !== 4))) {
      setStaffError('Name and 4-digit PIN are required for new staff');
      return;
    }
    if (editingStaff.pin && editingStaff.pin.length !== 4) {
      setStaffError('PIN must be exactly 4 digits');
      return;
    }
    try {
      await window.sikapos.users.save(editingStaff);
      setShowStaffModal(false);
      setEditingStaff(null);
      loadStaff();
    } catch (err: any) {
      setStaffError(err.message || 'Failed to save staff');
    }
  };

  const handleDeleteStaff = async (id: number) => {
    if (window.confirm('Are you sure you want to delete this staff member?')) {
      try {
        await window.sikapos.users.delete(id);
        loadStaff();
      } catch (err: any) {
        alert(err.message || 'Failed to delete staff');
      }
    }
  };

  const handleClearInventory = async () => {
    if (!window.sikapos) return;
    
    // First check how many products exist
    try {
      const allProducts = await window.sikapos.inventory.getAll({ limit: 1000 });
      if (allProducts.length === 0) {
        alert('No products found in inventory to clear.');
        return;
      }
    } catch (err) {
      console.error('Error checking products:', err);
      alert('Error checking products: ' + err.message);
      return;
    }
    
    const confirmed = confirm('This will permanently clear all inventory and synchronize the deletion with the cloud. This cannot be undone. Continue?');
    if (!confirmed) return;

    setSavingInventory(true);
    try {
      const result = await window.sikapos.inventory.clearAll();
      if (result.success) {
        window.sikapos.notifications.show('Inventory Cleared', `Removed ${result.count} products and queued sync.`);
        alert(`All ${result.count} products cleared successfully. Cloud sync initiated.`);
      } else {
        alert('Failed to clear inventory: ' + result.message);
      }
    } catch (err: any) {
      console.error('Error clearing inventory:', err);
      alert('Error clearing inventory: ' + err.message);
    } finally {
      setSavingInventory(false);
    }
  };

  const handleCloudRestore = async () => {
    if (!window.confirm('This will download all data from the cloud and merge it with your local data. Continue?')) return;
    setSaving(true);
    try {
      const res = await window.sikapos.sync.restore();
      if (res.success) {
        setSaved(true);
        window.sikapos.notifications.show('Recovery Complete', `Successfully restored ${res.count} items.`);
        setTimeout(() => window.location.reload(), 2000);
      }
    } catch (err: any) {
      alert('Cloud recovery failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.screen}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerContent}>
          <div>
            <h1 className={styles.title}>Settings</h1>
            <p className={styles.subtitle}>Configure your business, staff, and hardware preferences</p>
          </div>
          {(activeTab === 'business' || activeTab === 'hardware') && (
            <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
              {saving ? (
                <span className={styles.btnSpinner} />
              ) : saved ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  Saved!
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                  Save Changes
                </>
              )}
            </button>
          )}
        </div>

        {/* Tab nav */}
        <nav className={styles.tabs}>
          {TABS.filter(t => t.id !== 'staff' || user?.role === 'admin').map(tab => (
            <button
              key={tab.id}
              className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className={styles.tabIcon}>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Body */}
      <div className={styles.body}>

        {/* ── Business Profile ── */}
        {activeTab === 'business' && (
          <div className={styles.tabContent}>
            {/* Logo card */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <div className={styles.cardIcon}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                </div>
                <div>
                  <h3 className={styles.cardTitle}>Business Logo</h3>
                  <p className={styles.cardDesc}>This appears on printed receipts and PDF reports</p>
                </div>
              </div>
              <div className={styles.logoArea}>
                <div className={styles.logoPreview}>
                  {businessLogo ? (
                    <img src={businessLogo} alt="Logo" className={styles.logoImg} />
                  ) : (
                    <div className={styles.logoPlaceholder}>
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                      <span>No logo</span>
                    </div>
                  )}
                </div>
                <label className={styles.uploadBtn}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  Upload Logo
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = async (ev) => {
                        const base64 = ev.target?.result as string;
                        if (window.sikapos?.secureStore) {
                          await window.sikapos.secureStore.set('business_logo', base64);
                          setBusinessLogo(base64);
                        }
                      };
                      reader.readAsDataURL(file);
                    }
                  }} />
                </label>
                {businessLogo && (
                  <button className={styles.removeLogo} onClick={async () => {
                    await window.sikapos?.secureStore.set('business_logo', '');
                    setBusinessLogo('');
                  }}>Remove</button>
                )}
              </div>
            </div>

            {/* Business info card */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <div className={styles.cardIcon}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                </div>
                <div>
                  <h3 className={styles.cardTitle}>Business Information</h3>
                  <p className={styles.cardDesc}>Appears on all receipts, reports, and invoices</p>
                </div>
              </div>
              <div className={styles.formGrid}>
                <div className={styles.formField}>
                  <label>Business Name</label>
                  <input value={settings.business_name} onChange={e => setSettings(s => ({ ...s, business_name: e.target.value }))} placeholder="e.g. My Grocery Shop" />
                </div>
                <div className={styles.formField}>
                  <label>Business Phone</label>
                  <input value={settings.business_phone} onChange={e => setSettings(s => ({ ...s, business_phone: e.target.value }))} placeholder="024 000 0000" />
                </div>
                <div className={`${styles.formField} ${styles.fullWidth}`}>
                  <label>Business Address</label>
                  <input value={settings.business_address} onChange={e => setSettings(s => ({ ...s, business_address: e.target.value }))} placeholder="Accra, Ghana" />
                </div>
                <div className={styles.formField}>
                  <label>TIN Number</label>
                  <input value={settings.tin} onChange={e => setSettings(s => ({ ...s, tin: e.target.value }))} placeholder="C000000000" />
                </div>
                <div className={styles.formField}>
                  <label>Default Cashier Name</label>
                  <input value={settings.cashier_name} onChange={e => setSettings(s => ({ ...s, cashier_name: e.target.value }))} placeholder="Admin" />
                </div>
                <div className={`${styles.formField} ${styles.fullWidth}`}>
                  <label>Receipt Footer Message</label>
                  <input value={settings.receipt_footer} onChange={e => setSettings(s => ({ ...s, receipt_footer: e.target.value }))} placeholder="Thank you for shopping with us!" />
                </div>
                <div className={`${styles.formField} ${styles.fullWidth}`}>
                  <label>Daily Report Phone Number (WhatsApp/SMS)</label>
                  <input value={settings.owner_whatsapp} onChange={e => setSettings(s => ({ ...s, owner_whatsapp: e.target.value }))} placeholder="e.g. 233240000000" />
                  <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px' }}>Owner will receive professional sales summaries daily on this number.</p>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* ── Staff Management ── */}
        {activeTab === 'staff' && user?.role === 'admin' && (
          <div className={styles.tabContent}>
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <div className={styles.cardIcon}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                </div>
                <div style={{ flex: 1 }}>
                  <h3 className={styles.cardTitle}>Staff Management</h3>
                  <p className={styles.cardDesc}>Manage cashiers and admins. Each user gets a unique 4-digit PIN.</p>
                </div>
                <button className={styles.saveBtn} onClick={() => { setEditingStaff({ name: '', pin: '', role: 'cashier' }); setStaffError(''); setShowStaffModal(true); }}>
                  + Add Staff
                </button>
              </div>

              <div className={styles.staffTable}>
                <div className={styles.staffHeader}>
                  <span>Name</span>
                  <span>Role</span>
                  <span>Added On</span>
                  <span style={{ textAlign: 'right' }}>Actions</span>
                </div>
                {staff.length === 0 ? (
                  <div className={styles.staffEmpty}>No staff members added yet.</div>
                ) : staff.map(s => (
                  <div key={s.id} className={styles.staffRow}>
                    <div className={styles.staffName}>
                      <div className={styles.staffAvatar}>{s.name[0]?.toUpperCase()}</div>
                      <span>{s.name}</span>
                    </div>
                    <span>
                      <span className={`${styles.roleBadge} ${s.role === 'admin' ? styles.roleAdmin : s.role === 'manager' ? styles.roleManager : styles.roleCashier}`}>
                        {s.role}
                      </span>
                    </span>
                    <span className={styles.staffDate}>{new Date(s.created_at).toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    <div className={styles.staffActions}>
                      <button className={styles.editBtn} onClick={() => { setEditingStaff({ id: s.id, name: s.name, pin: '', role: s.role }); setStaffError(''); setShowStaffModal(true); }}>Edit</button>
                      <button className={styles.deleteBtn} onClick={() => handleDeleteStaff(s.id)}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Hardware ── */}
        {activeTab === 'hardware' && (
          <div className={styles.tabContent}>
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <div className={styles.cardIcon}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                </div>
                <div>
                  <h3 className={styles.cardTitle}>Receipt Printer</h3>
                  <p className={styles.cardDesc}>Select your USB thermal receipt printer</p>
                </div>
              </div>
              <div className={styles.formGrid}>
                <div className={`${styles.formField} ${styles.fullWidth}`}>
                  <label>Connected USB Printers</label>
                  <select
                    className={styles.select}
                    value={settings.printerDeviceId}
                    onChange={e => setSettings(s => ({ ...s, printerDeviceId: e.target.value }))}
                  >
                    <option value="">-- Select Printer --</option>
                    {printers.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className={styles.cardActions}>
                <button className={styles.outlineBtn} onClick={() => window.sikapos?.printer?.testPrint()}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                  Print Test Page
                </button>
              </div>
            </div>

            {/* Keyboard shortcuts */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <div className={styles.cardIcon}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10"/></svg>
                </div>
                <div>
                  <h3 className={styles.cardTitle}>Keyboard Shortcuts</h3>
                  <p className={styles.cardDesc}>Speed up your workflow with these shortcuts</p>
                </div>
              </div>
              <div className={styles.shortcutGrid}>
                {[
                  ['Ctrl+F / F3', 'Focus product search'],
                  ['F10', 'Open Charge / Payment'],
                  ['Escape', 'Clear search / Close modal'],
                  ['Ctrl+P', 'Print last receipt'],
                  ['Enter', 'New sale (in receipt)'],
                ].map(([key, action]) => (
                  <div key={key} className={styles.shortcutRow}>
                    <kbd className={styles.kbd}>{key}</kbd>
                    <span>{action}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Cloud & Data ── */}
        {activeTab === 'cloud' && (
          <div className={styles.tabContent}>
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <div className={styles.cardIcon} style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>
                </div>
                <div>
                  <h3 className={styles.cardTitle}>Cloud Recovery</h3>
                  <p className={styles.cardDesc}>Download and restore all your data from the sync server. Use this when setting up a new device.</p>
                </div>
              </div>
              <div className={styles.recoveryBox}>
                <div className={styles.recoveryStats}>
                  <div className={styles.recoveryStat}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
                    <span>Products</span>
                  </div>
                  <div className={styles.recoveryStat}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                    <span>Sales</span>
                  </div>
                  <div className={styles.recoveryStat}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                    <span>Customers</span>
                  </div>
                </div>

                <div style={{ marginTop: '24px', padding: '16px', background: 'rgba(59,130,246,0.05)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(59,130,246,0.1)' }}>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '14px' }}>Cloud Identity</h4>
                  <p style={{ margin: '0 0 16px 0', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                    Your store name must be synced for the web portal login to work.
                  </p>
                  <button 
                    className={styles.outlineBtn} 
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={async () => {
                      setSaving(true);
                      try {
                        const licenseKey = await window.sikapos?.secureStore.get('license_key');
                        const res = await fetch(`${CLOUD_SERVER_URL}/v1/licenses/update-name`, {
                          method: 'POST',
                          headers: { 
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${licenseKey}`
                          },
                          body: JSON.stringify({ license_key: licenseKey, business_name: settings.business_name })
                        });
                        
                        const data = await res.json();
                        
                        if (res.ok) {
                          window.sikapos.notifications.show('Cloud Synced', 'Store identity updated on the portal.');
                        } else {
                          alert(`Sync failed: ${data.message || 'Server error'}`);
                        }
                      } catch (e: any) {
                        alert(`Sync failed: ${e.message}. The cloud server might still be building - please try again in 1 minute.`);
                      } finally {
                        setSaving(false);
                      }
                    }}
                  >
                    Sync Identity to Portal
                  </button>
                </div>

                <div style={{ marginTop: '20px', padding: '16px', background: 'rgba(248, 113, 113, 0.08)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(248, 113, 113, 0.18)' }}>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '14px' }}>Clear Inventory</h4>
                  <p style={{ margin: '0 0 12px 0', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                    Permanently clear all local inventory and queue a cloud delete sync. This cannot be undone.
                  </p>
                  <button
                    type="button"
                    className={styles.dangerBtn}
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={handleClearInventory}
                    disabled={savingInventory}
                  >
                    {savingInventory ? 'Clearing...' : 'Clear All Inventory'}
                  </button>
                </div>

                <button className={styles.restoreBtn} onClick={handleCloudRestore} disabled={saving} style={{ marginTop: '16px' }}>
                  {saving ? 'Processing...' : 'Start Cloud Recovery'}
                </button>
              </div>
              {saved && <p className={styles.recoverySuccess}>✓ Data recovery complete! Restarting system...</p>}
            </div>
          </div>
        )}

        {/* ── About ── */}
        {activeTab === 'about' && (
          <div className={styles.tabContent}>
            <div className={styles.card}>
              <div className={styles.aboutHero}>
                <div className={styles.aboutLogo}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                </div>
                <div>
                  <h2 className={styles.aboutName}>SikaPOS</h2>
                  <p className={styles.aboutTagline}>Point of Sale — Electron Edition</p>
                  <span className={styles.versionBadge}>v1.0.0</span>
                </div>
              </div>
              <div className={styles.infoGrid}>
                {[
                  ['Developer', 'DanniTech Solution'],
                  ['Platform', navigator.platform],
                  ['Database', 'SQLite (Local)'],
                  ['Tax System', 'Ghana Revenue Authority (GRA) 2024'],
                  ['VAT Rate', '12.5%'],
                  ['NHIL', '2.5%'],
                  ['GETFund', '2.5%'],
                  ['COVID Levy', '1%'],
                ].map(([label, value]) => (
                  <div key={label} className={styles.infoRow}>
                    <span className={styles.infoLabel}>{label}</span>
                    <span className={styles.infoValue}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Staff Modal */}
      {showStaffModal && editingStaff && (
        <div className={styles.modalOverlay} onClick={() => { setShowStaffModal(false); setEditingStaff(null); }}>
          <div className={styles.modalCard} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>{editingStaff.id ? 'Edit Staff Member' : 'Add New Staff'}</h2>
              <button className={styles.modalClose} onClick={() => { setShowStaffModal(false); setEditingStaff(null); }}>×</button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.formField}>
                <label>Full Name</label>
                <input value={editingStaff.name} onChange={e => setEditingStaff({ ...editingStaff, name: e.target.value })} placeholder="Staff member name" />
              </div>
              <div className={styles.formField}>
                <label>Role</label>
                <select className={styles.select} value={editingStaff.role} onChange={e => setEditingStaff({ ...editingStaff, role: e.target.value })}>
                  <option value="cashier">Cashier</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className={styles.formField}>
                <label>{editingStaff.id ? 'New PIN (leave blank to keep current)' : '4-Digit PIN'}</label>
                <input type="password" maxLength={4} value={editingStaff.pin} onChange={e => setEditingStaff({ ...editingStaff, pin: e.target.value.replace(/\D/g, '') })} placeholder="••••" />
              </div>
              {staffError && <p className={styles.staffError}>{staffError}</p>}
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.outlineBtn} onClick={() => { setShowStaffModal(false); setEditingStaff(null); }}>Cancel</button>
              <button className={styles.saveBtn} onClick={handleSaveStaff}>Save Staff</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
