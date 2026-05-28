import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Key, Link2, LogOut, ChevronRight, Plus } from 'lucide-react';
import { useAuthStore, type PortalStore } from '../store/auth';
import { linkOwnerStore, switchOwnerStore } from '../utils/ownerApi';

export default function OwnerStores() {
  const navigate = useNavigate();
  const { ownerName, ownerToken, token, stores, setStores, setBusinessSession, logout } = useAuthStore();

  const [licenseKey, setLicenseKey] = useState('');
  const [adminPin, setAdminPin] = useState('');
  const [linking, setLinking] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [showLinkForm, setShowLinkForm] = useState(stores.length === 0);

  const authForSwitch = token || ownerToken;
  if (!ownerToken) return null;

  const openStore = async (store: PortalStore) => {
    if (!authForSwitch) return;
    setSwitchingId(store.businessId);
    setError('');
    try {
      const data = await switchOwnerStore(store.businessId, authForSwitch);
      setBusinessSession({
        token: data.token,
        businessId: data.businessId,
        businessName: data.businessName,
        businessLogo: data.businessLogo,
        businessAddress: data.businessAddress,
        businessPhone: data.businessPhone,
        userName: data.userName,
      });
      navigate('/reports', { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not open store');
    } finally {
      setSwitchingId(null);
    }
  };

  const handleLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ownerToken) return;
    setLinking(true);
    setError('');
    try {
      const updated = await linkOwnerStore(licenseKey.trim(), adminPin, ownerToken);
      setStores(updated);
      setLicenseKey('');
      setAdminPin('');
      setShowLinkForm(false);
      if (updated.length === 1) {
        await openStore(updated[0]);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not link store');
    } finally {
      setLinking(false);
    }
  };

  return (
    <Page>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 20px 48px' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 24, margin: '0 0 4px' }}>Your stores</h1>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 14 }}>
              Signed in as {ownerName || 'Owner'}
            </p>
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={logout}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <LogOut size={16} /> Log out
          </button>
        </header>

        <p style={{ color: 'var(--text-muted)', marginBottom: 24, fontSize: 15 }}>
          Select a store to view reports, inventory, and customers. Link each location using its
          license key and admin PIN from SikaPOS Settings.
        </p>

        {error && (
          <div
            style={{
              padding: 12,
              marginBottom: 16,
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--danger)',
              fontSize: 14,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
          {stores.map((store) => (
            <button
              key={store.businessId}
              type="button"
              className="glass-panel"
              onClick={() => openStore(store)}
              disabled={!!switchingId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                padding: '18px 20px',
                textAlign: 'left',
                cursor: switchingId ? 'wait' : 'pointer',
                border: '1px solid var(--border-light)',
                width: '100%',
                color: 'inherit',
              }}
            >
              <StoreAvatar logo={store.businessLogo} name={store.businessName} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: 16,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {store.businessName}
                </div>
                {store.businessAddress && (
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>
                    {store.businessAddress}
                  </p>
                )}
                <p
                  style={{
                    fontSize: 12,
                    color: store.status === 'active' ? 'var(--success)' : 'var(--text-muted)',
                    margin: '4px 0 0',
                  }}
                >
                  {switchingId === store.businessId ? 'Opening…' : store.status === 'active' ? 'Active' : 'Inactive'}
                </p>
              </div>
              <ChevronRight size={20} color="var(--text-muted)" />
            </button>
          ))}

          {stores.length === 0 && !showLinkForm && (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>
              No stores linked yet. Add your first store below.
            </p>
          )}
        </div>

        <button
          type="button"
          className="btn-primary ripple"
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          onClick={() => setShowLinkForm(true)}
        >
          <Plus size={18} /> Link another store
        </button>

        {showLinkForm && (
          <div className="modal-overlay animate-fade-in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <form
              onSubmit={handleLink}
              className="glass-panel modal-panel"
              style={{ width: '90%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 16 }}
            >
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Link2 size={20} color="var(--primary)" /> Link a store
              </h3>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                Enter the license key and admin PIN from your SikaPOS local installation to sync this store's cloud reports.
              </p>
              
              <FormField
                label="License key"
                icon={<Key size={18} />}
                value={licenseKey}
                onChange={setLicenseKey}
                placeholder="SIKA-XXXX-XXXX-XXXX"
              />
              <FormField
                label="Store admin PIN"
                icon={<Building2 size={18} />}
                value={adminPin}
                onChange={setAdminPin}
                placeholder="Admin PIN from that store"
                type="password"
              />
              <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                <button type="submit" className="btn-primary ripple" style={{ flex: 1 }} disabled={linking}>
                  {linking ? 'Linking…' : 'Link store'}
                </button>
                <button type="button" className="btn-secondary ripple" onClick={() => setShowLinkForm(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </Page>
  );
}

function Page({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>{children}</div>;
}

function StoreAvatar({ logo, name }: { logo?: string | null; name: string }) {
  if (logo) {
    return (
      <img src={logo} alt="" style={{ width: 48, height: 48, borderRadius: 10, objectFit: 'cover' }} />
    );
  }
  return (
    <div
      style={{
        width: 48,
        height: 48,
        borderRadius: 10,
        background: 'var(--bg-elevated)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 20,
        fontWeight: 700,
        color: 'var(--secondary)',
      }}
    >
      {(name[0] || 'S').toUpperCase()}
    </div>
  );
}

function FormField({
  label,
  icon,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  icon: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
}) {
  return (
    <div>
      <label style={{ display: 'block', marginBottom: 8, fontSize: 14, color: 'var(--text-muted)' }}>
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', left: 16, top: 16, color: 'var(--text-muted)' }}>{icon}</span>
        <input
          type={type}
          className="input-field"
          style={{ paddingLeft: 44 }}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required
        />
      </div>
    </div>
  );
}
