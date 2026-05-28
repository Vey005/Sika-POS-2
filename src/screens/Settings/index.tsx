import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuthStore, type ReceiptConfig } from '../../store/auth';
import {
  CASHIER_NAV_TAB_IDS,
  mergeCashierNavVisibility,
  resolveCashierNavForUser,
  type CashierNavTabId,
} from '../../constants/cashierNav';
import { CLOUD_SERVER_URL } from '../../config';
import { showAlert, showConfirm } from '../../store/dialogStore';
import { formatErrorMsg } from '../../utils/errorFormatter';
import AppUpdatePanel from '../../components/settings/AppUpdatePanel';
import ReceiptPreviewModal from '../../components/pos/ReceiptPreviewModal';
import styles from './Settings.module.css';


const CASHIER_NAV_LABELS: Record<CashierNavTabId, string> = {
  pos: 'POS',
  inventory: 'Inventory',
  restock: 'Restock',
  customers: 'Customers',
  dashboard: 'Dashboard',
  reports: 'Reports',
  settings: 'Settings',
};

type Tab = 'business' | 'staff' | 'hardware' | 'cloud' | 'about';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'business', label: 'Business', icon: '🏢' },
  { id: 'staff', label: 'Staff', icon: '👥' },
  { id: 'hardware', label: 'Hardware', icon: '🖨️' },
  { id: 'cloud', label: 'Cloud & Data', icon: '☁️' },
  { id: 'about', label: 'About', icon: 'ℹ️' },
];

export default function SettingsScreen() {
  const [searchParams] = useSearchParams();
  const { setBusinessInfo, businessLogo, setBusinessLogo } = useAuthStore();
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const tab = searchParams.get('tab');
    return tab === 'about' || tab === 'staff' || tab === 'hardware' || tab === 'cloud'
      ? tab
      : 'business';
  });
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
    custom_categories: '',
    expiry_alert_months_default: '3',
  });
  const [taxConfig, setTaxConfig] = useState([
    { id: 'vat', name: 'VAT', rate: 12.5 },
    { id: 'nhil', name: 'NHIL', rate: 2.5 },
    { id: 'getfund', name: 'GETFund', rate: 2.5 },
    { id: 'covid', name: 'COVID Levy', rate: 1.0 }
  ]);
  const [taxEnabled, setTaxEnabled] = useState(true);
  const [showReceiptPreview, setShowReceiptPreview] = useState(false);
  const [receiptConfig, setReceiptConfig] = useState<ReceiptConfig>({
    showLogo: true,
    showCashier: true,
    showCustomer: true,
    showTaxBreakdown: true,
    showOrderType: true,
    showOrderNote: true,
    showPoweredBy: true,
    showAddress: true,
    showPhone: true,
    showTIN: true,
    showBarcode: true,
    currency: 'GH₵',
    paperSize: '80mm',
    template: 'standard',
  });
  const [printers, setPrinters] = useState<Array<{ id: string; name: string }>>([]);
  const [loadingPrinters, setLoadingPrinters] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingInventory, setSavingInventory] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [appVersion, setAppVersion] = useState('…');

  const [cashierNav, setCashierNav] = useState(() => mergeCashierNavVisibility(undefined));

  const [staffSidebarCustom, setStaffSidebarCustom] = useState(false);
  const [staffNavToggles, setStaffNavToggles] = useState(() => mergeCashierNavVisibility(undefined));

  const [staff, setStaff] = useState<Array<{ id: number; name: string; role: string; created_at: string; cashier_nav_visibility?: string | null }>>([]);
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState<{ id?: number; name: string; password: string; role: string } | null>(null);
  const [staffError, setStaffError] = useState('');
  const { user } = useAuthStore();

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'about' || tab === 'staff' || tab === 'hardware' || tab === 'cloud') {
      setActiveTab(tab);
    }
  }, [searchParams]);

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
        custom_categories: biz.custom_categories || '',
        expiry_alert_months_default: biz.expiry_alert_months_default || '3',
      }));
      if (biz.tax_config) {
        try { setTaxConfig(JSON.parse(biz.tax_config)); } catch(e) {}
      }
      if (biz.tax_enabled !== undefined) {
        setTaxEnabled(biz.tax_enabled === 'true' || biz.tax_enabled === '1');
      }
      if (biz.receipt_config) {
        try { setReceiptConfig(rc => ({ ...rc, ...JSON.parse(biz.receipt_config) })); } catch(e) {}
      }
      setCashierNav(mergeCashierNavVisibility(biz.cashier_nav_visibility));
    });
    if (window.sikapos.printer) {
      window.sikapos.printer.listPrinters().then(setPrinters);
    }
    window.sikapos.secureStore.get('printerDeviceId').then((val: any) => {
      if (val) setSettings(s => ({ ...s, printerDeviceId: val }));
    });
    loadStaff();
    window.sikapos?.updates?.getState().then(s => setAppVersion(s.currentVersion));
  }, []);

  const refreshPrinters = async () => {
    if (!window.sikapos?.printer) return;
    setLoadingPrinters(true);
    try {
      const list = await window.sikapos.printer.listPrinters();
      setPrinters(list);
    } finally {
      setLoadingPrinters(false);
    }
  };

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
        custom_categories: settings.custom_categories,
        tax_config: JSON.stringify(taxConfig),
        tax_enabled: String(taxEnabled),
        receipt_config: JSON.stringify(receiptConfig),
        cashier_nav_visibility: JSON.stringify(cashierNav),
        expiry_alert_months_default: settings.expiry_alert_months_default,
      });
      await window.sikapos.secureStore.set('printerDeviceId', settings.printerDeviceId);
      setBusinessInfo(settings.business_name);
      useAuthStore.getState().setReceiptFooter(settings.receipt_footer);
      useAuthStore.getState().setTaxConfig(taxConfig);
      useAuthStore.getState().setTaxEnabled(taxEnabled);
      useAuthStore.getState().setReceiptConfig(receiptConfig);
      useAuthStore.getState().setCashierNavVisibility(cashierNav);

      // --- Sync Business Info (Name & Logo) to Cloud Portal via Sync Queue ---
      const businessLogo = await window.sikapos?.secureStore.get('business_logo');
      await window.sikapos?.sync.queueItem({
        entity: 'business_info',
        operation: 'update',
        payload: {
          business_name: settings.business_name,
          business_logo: businessLogo || null
        },
        priority: 2 // High priority
      });
      
      console.log('[Settings] Business info update queued for sync.');

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveStaff = async () => {
    if (!editingStaff) return;
    setStaffError('');
    if (!editingStaff.name || (!editingStaff.id && (!editingStaff.password || editingStaff.password.length < 4))) {
      setStaffError('Name and password (min 4 characters) are required for new staff');
      return;
    }
    if (editingStaff.password && editingStaff.password.length < 4) {
      setStaffError('Password must be at least 4 characters');
      return;
    }
    try {
      const cashier_nav_visibility =
        editingStaff.role === 'cashier'
          ? staffSidebarCustom
            ? JSON.stringify(staffNavToggles)
            : null
          : null;
      await window.sikapos.users.save({ ...editingStaff, cashier_nav_visibility });
      setShowStaffModal(false);
      setEditingStaff(null);
      loadStaff();
    } catch (err: any) {
      setStaffError(formatErrorMsg(err, 'Failed to save staff'));
    }
  };

  const handleDeleteStaff = async (id: number) => {
    const ok = await showConfirm('Are you sure you want to delete this staff member?');
    if (ok) {
      try {
        await window.sikapos.users.delete(id);
        loadStaff();
      } catch (err: any) {
        await showAlert(formatErrorMsg(err, 'Failed to delete staff'));
      }
    }
  };

  const handleClearInventory = async () => {
    if (!window.sikapos) return;
    
    // First check how many products exist
    try {
      const allProducts = await window.sikapos.inventory.getAll({ limit: 1000 });
      if (allProducts.length === 0) {
        await showAlert('No products found in inventory to clear.');
        return;
      }
    } catch (err: any) {
      console.error('Error checking products:', err);
      await showAlert(`Error checking products: ${formatErrorMsg(err)}`);
      return;
    }
    
    const confirmed = await showConfirm('This will permanently clear all inventory and synchronize the deletion with the cloud. This cannot be undone. Continue?');
    if (!confirmed) return;

    setSavingInventory(true);
    try {
      const result = await window.sikapos.inventory.clearAll();
      if (result.success) {
        window.sikapos.notifications.show('Inventory Cleared', `Removed ${result.count} products and queued sync.`);
        await showAlert(`All ${result.count} products cleared successfully. Cloud sync initiated.`);
      } else {
        await showAlert(`Failed to clear inventory: ${formatErrorMsg(result.message)}`);
      }
    } catch (err: any) {
      console.error('Error clearing inventory:', err);
      await showAlert(`Error clearing inventory: ${formatErrorMsg(err)}`);
    } finally {
      setSavingInventory(false);
    }
  };

  const handleCloudRestore = async () => {
    const ok = await showConfirm('This will download all data from the cloud and merge it with your local data. Continue?');
    if (!ok) return;
    setSaving(true);
    try {
      const res = await window.sikapos.sync.restore();
      if (res.success) {
        setSaved(true);
        window.sikapos.notifications.show('Recovery Complete', `Successfully restored ${res.count} items.`);
        setTimeout(() => window.location.reload(), 2000);
      }
    } catch (err: any) {
      await showAlert(`Cloud recovery failed: ${formatErrorMsg(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleExportInventory = async () => {
    if (!window.sikapos) return;
    setExporting(true);
    try {
      const result = await window.sikapos.inventory.exportInventory();
      if (result.success) {
        window.sikapos.notifications.show(
          'Export Complete',
          `${result.count} products exported (same columns as import template).`
        );
      } else if (result.message && result.message !== 'Export cancelled') {
        await showAlert(result.message);
      }
    } catch (err: any) {
      console.error('Export error:', err);
      await showAlert(`Export failed: ${formatErrorMsg(err)}`);
    } finally {
      setExporting(false);
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
                          
                          // Queue sync
                          await window.sikapos?.sync.queueItem({
                            entity: 'business_info',
                            operation: 'update',
                            payload: { business_name: settings.business_name, business_logo: base64 },
                            priority: 2
                          });
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
                    // Queue sync
                    await window.sikapos?.sync.queueItem({
                      entity: 'business_info',
                      operation: 'update',
                      payload: { business_name: settings.business_name, business_logo: null },
                      priority: 2
                    });
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
                  <label>Custom Product Categories</label>
                  <input value={settings.custom_categories} onChange={e => setSettings(s => ({ ...s, custom_categories: e.target.value }))} placeholder="E.g. Beverages, Food, Electronics (comma separated)" />
                  <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px' }}>These will appear in the category dropdown when adding inventory items.</p>
                </div>
                <div className={styles.formField}>
                  <label>Default expiry alert (months)</label>
                  <input
                    type="number"
                    min={0}
                    max={60}
                    value={settings.expiry_alert_months_default}
                    onChange={e => setSettings(s => ({ ...s, expiry_alert_months_default: e.target.value }))}
                  />
                  <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                    Expiry products show in Expiring Soon this many months before sell-by. Use 0 to alert only after expiry.
                  </p>
                </div>
                <div className={`${styles.formField} ${styles.fullWidth}`}>
                  <label>Daily Report Phone Number (WhatsApp/SMS)</label>
                  <input value={settings.owner_whatsapp} onChange={e => setSettings(s => ({ ...s, owner_whatsapp: e.target.value }))} placeholder="e.g. 233240000000" />
                  <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px' }}>Owner will receive professional sales summaries daily on this number.</p>
                </div>
              </div>
            </div>

            {/* Taxes and Levies card */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <div className={styles.cardIcon}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                </div>
                <div>
                  <h3 className={styles.cardTitle}>Taxes & Levies</h3>
                  <p className={styles.cardDesc}>Enable or disable sales tax for all products. Customize tax names and rates below.</p>
                </div>
              </div>
              {/* Global tax enabled toggle */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '14px 16px',
                background: taxEnabled ? 'rgba(34, 197, 94, 0.08)' : 'var(--color-surface)',
                border: `1px solid ${taxEnabled ? 'rgba(34, 197, 94, 0.3)' : 'var(--color-border)'}`,
                borderRadius: 'var(--radius-md)',
                marginBottom: '16px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }} onClick={() => setTaxEnabled(!taxEnabled)}>
                <input
                  type="checkbox"
                  checked={taxEnabled}
                  onChange={e => setTaxEnabled(e.target.checked)}
                  onClick={e => e.stopPropagation()}
                  style={{ accentColor: 'var(--color-gold)', width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <div>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: '14px', color: 'var(--color-text-primary)' }}>
                    Apply sales tax to all products
                  </p>
                  <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                    When enabled, VAT, NHIL, GETFund and COVID levy are added to every sale. When disabled, no tax is charged.
                  </p>
                </div>
              </div>
              <div className={styles.formGrid}>
                {taxConfig.map((tax, idx) => (
                  <div key={tax.id} style={{ display: 'flex', gap: '16px', gridColumn: '1 / -1' }}>
                    <div className={styles.formField} style={{ flex: 2 }}>
                      <label>Tax Slot {idx + 1} Name</label>
                      <input 
                        value={tax.name} 
                        onChange={e => {
                          const updated = [...taxConfig];
                          updated[idx].name = e.target.value;
                          setTaxConfig(updated);
                        }} 
                        placeholder="e.g. VAT" 
                      />
                    </div>
                    <div className={styles.formField} style={{ flex: 1 }}>
                      <label>Rate (%)</label>
                      <input 
                        type="number" 
                        min="0" 
                        step="0.1" 
                        value={tax.rate} 
                        onChange={e => {
                          const updated = [...taxConfig];
                          updated[idx].rate = parseFloat(e.target.value) || 0;
                          setTaxConfig(updated);
                        }} 
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Receipt Design card */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <div className={styles.cardIcon}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v.5M12 6v.5"/></svg>
                </div>
                <div>
                  <h3 className={styles.cardTitle}>Receipt Design</h3>
                  <p className={styles.cardDesc}>Choose which sections appear on printed and digital receipts.</p>
                </div>
              </div>
              <div style={{ padding: '0 0 4px' }}>
                <div className={styles.formGrid} style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '16px' }}>
                  <div className={styles.formField}>
                    <label>Currency Symbol</label>
                    <input value={receiptConfig.currency} onChange={e => setReceiptConfig(rc => ({ ...rc, currency: e.target.value }))} placeholder="GH₵" />
                  </div>
                  <div className={styles.formField}>
                    <label>Paper Size</label>
                    <select className={styles.select} value={receiptConfig.paperSize || '80mm'} onChange={e => setReceiptConfig(rc => ({ ...rc, paperSize: e.target.value }))}>
                      <option value="80mm">80mm (Standard)</option>
                      <option value="58mm">58mm (Small)</option>
                      <option value="40mm">40mm (Extra Small)</option>
                    </select>
                  </div>
                  <div className={styles.formField}>
                    <label>Receipt Template</label>
                    <select className={styles.select} value={receiptConfig.template || 'standard'} onChange={e => setReceiptConfig(rc => ({ ...rc, template: e.target.value as any }))}>
                      <option value="standard">Standard / Classic</option>
                      <option value="compact">Compact (Eco-friendly)</option>
                      <option value="elegant">Elegant (Premium)</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '12px' }}>
                  {([
                    { key: 'showLogo', label: 'Business Logo' },
                    { key: 'showAddress', label: 'Business Address' },
                    { key: 'showPhone', label: 'Business Phone' },
                    { key: 'showTIN', label: 'TIN Number' },
                    { key: 'showCashier', label: 'Cashier Name' },
                    { key: 'showCustomer', label: 'Customer Name' },
                    { key: 'showTaxBreakdown', label: 'Tax Breakdown' },
                    { key: 'showOrderType', label: 'Order Type' },
                    { key: 'showOrderNote', label: 'Order Notes' },
                    { key: 'showBarcode', label: 'Transaction Barcode' },
                    { key: 'showPoweredBy', label: '"Powered by SikaPOS"' },
                  ] as Array<{ key: keyof typeof receiptConfig; label: string }>).map(opt => (
                    <label key={opt.key} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '10px 12px',
                      background: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer',
                      fontSize: '13px',
                      color: 'var(--color-text-secondary)',
                      transition: 'all 0.15s',
                    }}>
                      <input
                        type="checkbox"
                        checked={!!receiptConfig[opt.key]}
                        onChange={e => setReceiptConfig(rc => ({ ...rc, [opt.key]: e.target.checked }))}
                        style={{ accentColor: 'var(--color-gold)', width: '16px', height: '16px' }}
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setShowReceiptPreview(true)}
                  style={{
                    marginTop: '16px',
                    width: '100%',
                    padding: '12px 16px',
                    background: 'var(--color-gold-dim)',
                    border: '1px solid var(--color-gold)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--color-gold)',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  Preview receipt design (no printer needed)
                </button>
              </div>
            </div>

            {(user?.role === 'admin' || user?.role === 'manager') && (
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <div className={styles.cardIcon}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                  </div>
                  <div>
                    <h3 className={styles.cardTitle}>Cashier sidebar</h3>
                    <p className={styles.cardDesc}>Shop default for all cashiers (POS always on). You can override tabs for an individual cashier under Staff → Edit.</p>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '4px' }}>
                  {CASHIER_NAV_TAB_IDS.map(id => (
                    <label
                      key={id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '10px 12px',
                        background: 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-sm)',
                        cursor: id === 'pos' ? 'default' : 'pointer',
                        fontSize: '13px',
                        color: 'var(--color-text-secondary)',
                        opacity: id === 'pos' ? 0.85 : 1,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={cashierNav[id]}
                        disabled={id === 'pos'}
                        onChange={e =>
                          setCashierNav(c => ({
                            ...c,
                            [id]: id === 'pos' ? true : e.target.checked,
                          }))
                        }
                        style={{ accentColor: 'var(--color-gold)', width: '16px', height: '16px' }}
                      />
                      <span>
                        {CASHIER_NAV_LABELS[id]}
                        {id === 'settings' && (
                          <span style={{ display: 'block', fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                            Includes business profile, staff, hardware, and cloud tools if enabled.
                          </span>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

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
                  <p className={styles.cardDesc}>Manage cashiers and admins.</p>
                </div>
                <button
                  className={styles.saveBtn}
                  onClick={() => {
                    setEditingStaff({ name: '', password: '', role: 'cashier' });
                    setStaffSidebarCustom(false);
                    setStaffNavToggles(mergeCashierNavVisibility(JSON.stringify(cashierNav)));
                    setStaffError('');
                    setShowStaffModal(true);
                  }}
                >
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
                      <button
                        className={styles.editBtn}
                        onClick={() => {
                          setEditingStaff({ id: s.id, name: s.name, password: '', role: s.role });
                          const override = s.cashier_nav_visibility;
                          const hasCustom = override != null && String(override).trim() !== '';
                          setStaffSidebarCustom(hasCustom);
                          setStaffNavToggles(
                            resolveCashierNavForUser(JSON.stringify(cashierNav), hasCustom ? override : null)
                          );
                          setStaffError('');
                          setShowStaffModal(true);
                        }}
                      >
                        Edit
                      </button>
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
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <select
                      className={styles.select}
                      style={{ flex: 1 }}
                      value={settings.printerDeviceId}
                      onChange={e => setSettings(s => ({ ...s, printerDeviceId: e.target.value }))}
                    >
                      <option value="">-- Select Printer --</option>
                      {printers.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <button
                      className={styles.outlineBtn}
                      style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
                      onClick={refreshPrinters}
                      disabled={loadingPrinters}
                      title="Re-scan USB ports for connected printers"
                    >
                      {loadingPrinters ? (
                        <span className={styles.btnSpinner} />
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="23 4 23 10 17 10"/>
                          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                        </svg>
                      )}
                      Refresh
                    </button>
                  </div>
                  {printers.length === 0 && (
                    <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '6px' }}>
                      No USB devices found. Make sure your printer is plugged in and powered on, then click Refresh.
                    </p>
                  )}
                  {printers.length > 0 && !settings.printerDeviceId && (
                    <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '6px' }}>
                      🖨️ entries are likely printers. Select yours and click Save Changes.
                    </p>
                  )}
                </div>
              </div>
              <div className={styles.cardActions}>
                <button className={styles.outlineBtn} onClick={async () => {
                  try {
                    await window.sikapos?.printer?.testPrint();
                  } catch (e: any) {
                    await showAlert(`Printing failed: ${formatErrorMsg(e)}\n\nDid you install the WinUSB driver using Zadig? Check the hardware instructions.`);
                  }
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                  Print Test Page
                </button>
                <button className={styles.outlineBtn} onClick={async () => {
                  try {
                    await window.sikapos?.printer?.openDrawer();
                  } catch (e: any) {
                    await showAlert(`Action failed: ${e.message}\n\nCheck printer connection and WinUSB driver.`);
                  }
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="8" width="18" height="12" rx="2"/><path d="M12 11v2"/><path d="M3 8V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2"/></svg>
                  Open Cash Drawer
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

                <div style={{ padding: '16px', background: 'rgba(59,130,246,0.05)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(59,130,246,0.1)' }}>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '14px' }}>Cloud Identity</h4>
                  <p style={{ margin: '0 0 16px 0', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                    Your store name must be synced for the web portal login to work.
                  </p>
                  <button 
                    className={styles.outlineBtn} 
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={async () => {
                      console.log('[Sync] Identity sync button clicked');
                      setSaving(true);
                      try {
                        const licenseKey = await window.sikapos?.secureStore.get('license_key');
                        console.log('[Sync] Using license key:', licenseKey ? '***' + licenseKey.slice(-4) : 'MISSING');
                        
                        if (!licenseKey) {
                          throw new Error('No license key found. Please activate the app first.');
                        }

                        console.log('[Sync] Sending request to:', `${CLOUD_SERVER_URL}/v1/licenses/update-name`);
                        const res = await fetch(`${CLOUD_SERVER_URL}/v1/licenses/update-name`, {
                          method: 'POST',
                          headers: { 
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${licenseKey}`
                          },
                          body: JSON.stringify({ license_key: licenseKey, business_name: settings.business_name })
                        });
                        
                        console.log('[Sync] Response status:', res.status);
                        const data = await res.json();
                        console.log('[Sync] Response data:', data);
                        
                        if (res.ok) {
                          window.sikapos.notifications.show('Cloud Synced', 'Store identity updated on the portal.');
                        } else {
                          await showAlert(`Sync failed: ${data.message || 'Server error'}`);
                        }
                      } catch (e: any) {
                        console.error('[Sync] Identity sync failed:', e);
                        await showAlert(`Sync failed: ${e.message}. The cloud server might still be building - please try again in 1 minute.`);
                      } finally {
                        setSaving(false);
                      }
                    }}
                  >
                    Sync Identity to Portal
                  </button>
                </div>

                <div style={{ padding: '16px', background: 'rgba(248, 113, 113, 0.08)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(248, 113, 113, 0.18)' }}>
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

                <div style={{ padding: '16px', background: 'rgba(16,185,129,0.05)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(16,185,129,0.15)' }}>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '14px' }}>📦 Export Inventory</h4>
                  <p style={{ margin: '0 0 12px 0', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                    Export all products with the same columns as the Inventory import template (pack, expiry, tax, stock fields). CSV or Excel — re-import via Inventory → Import.
                  </p>
                  <button
                    type="button"
                    className={styles.outlineBtn}
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={handleExportInventory}
                    disabled={exporting}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    {exporting ? 'Exporting...' : 'Export All Products'}
                  </button>
                </div>

                <button className={styles.restoreBtn} onClick={handleCloudRestore} disabled={saving}>
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
                  <span className={styles.versionBadge}>v{appVersion}</span>
                </div>
              </div>
              <AppUpdatePanel />
              <div className={styles.infoGrid}>
                {[
                  ['Developer', 'DanniTech Solution'],
                  ['Tech Support', '0548470413 / 0599008533'],
                  ['Email', 'dannitechsolution@gmail.com'],
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
        <div className={styles.modalOverlay}>
          <div className={styles.modalCard}>
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
                <select
                  className={styles.select}
                  value={editingStaff.role}
                  onChange={e => {
                    const role = e.target.value;
                    setEditingStaff({ ...editingStaff, role });
                    if (role !== 'cashier') {
                      setStaffSidebarCustom(false);
                    }
                  }}
                >
                  <option value="cashier">Cashier</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              {editingStaff.role === 'cashier' && (
                <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--color-border)' }}>
                  <p style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px', color: 'var(--color-text-primary)' }}>
                    Sidebar tabs for this cashier
                  </p>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', cursor: 'pointer', fontSize: '13px' }}>
                    <input
                      type="radio"
                      name="staffNavMode"
                      checked={!staffSidebarCustom}
                      onChange={() => {
                        setStaffSidebarCustom(false);
                        setStaffNavToggles(mergeCashierNavVisibility(JSON.stringify(cashierNav)));
                      }}
                    />
                    Use shop default (Settings → Business)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', cursor: 'pointer', fontSize: '13px' }}>
                    <input
                      type="radio"
                      name="staffNavMode"
                      checked={staffSidebarCustom}
                      onChange={() => {
                        setStaffSidebarCustom(true);
                        setStaffNavToggles(resolveCashierNavForUser(JSON.stringify(cashierNav), null));
                      }}
                    />
                    Custom for this cashier only
                  </label>
                  {staffSidebarCustom && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      {CASHIER_NAV_TAB_IDS.map(id => (
                        <label
                          key={id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '8px 10px',
                            background: 'var(--color-surface)',
                            border: '1px solid var(--color-border)',
                            borderRadius: 'var(--radius-sm)',
                            cursor: id === 'pos' ? 'default' : 'pointer',
                            fontSize: '12px',
                            color: 'var(--color-text-secondary)',
                            opacity: id === 'pos' ? 0.85 : 1,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={staffNavToggles[id]}
                            disabled={id === 'pos'}
                            onChange={e =>
                              setStaffNavToggles(c => ({
                                ...c,
                                [id]: id === 'pos' ? true : e.target.checked,
                              }))
                            }
                            style={{ accentColor: 'var(--color-gold)', width: '14px', height: '14px' }}
                          />
                          {CASHIER_NAV_LABELS[id]}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className={styles.formField}>
                <label>{editingStaff.id ? 'New Password (leave blank to keep current)' : 'Password'}</label>
                <input type="password" value={editingStaff.password} onChange={e => setEditingStaff({ ...editingStaff, password: e.target.value })} placeholder="Enter password (min 4 characters)" />
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

      {showReceiptPreview && (
        <ReceiptPreviewModal onClose={() => setShowReceiptPreview(false)} />
      )}
    </div>
  );
}
