import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Store } from 'lucide-react';
import { useAuthStore } from '../store/auth';
import { switchOwnerStore } from '../utils/ownerApi';

export default function StoreSwitcher() {
  const navigate = useNavigate();
  const { stores, businessId, ownerToken, token, setBusinessSession } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!ownerToken || stores.length < 1) return null;

  const authForSwitch = token || ownerToken;

  const handleSelect = async (id: string) => {
    if (id === businessId || !authForSwitch) {
      setOpen(false);
      return;
    }
    setBusy(true);
    try {
      const data = await switchOwnerStore(id, authForSwitch);
      setBusinessSession({
        token: data.token,
        businessId: data.businessId,
        businessName: data.businessName,
        businessLogo: data.businessLogo,
        businessAddress: data.businessAddress,
        businessPhone: data.businessPhone,
        userName: data.userName,
      });
      setOpen(false);
      navigate('/reports', { replace: true });
      window.location.reload();
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 10px',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-light)',
          background: 'var(--bg-elevated)',
          color: 'var(--text-main)',
          fontSize: 13,
          cursor: busy ? 'wait' : 'pointer',
          maxWidth: 'min(140px, 28vw)',
        }}
      >
        <Store size={14} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          Switch store
        </span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: 6,
            minWidth: 'min(220px, calc(100vw - 32px))',
            maxWidth: 'calc(100vw - 32px)',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 12px 32px rgba(0,0,0,0.35)',
            zIndex: 120,
            overflow: 'hidden',
          }}
        >
          {stores.map((s) => (
            <button
              key={s.businessId}
              type="button"
              onClick={() => handleSelect(s.businessId)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '12px 14px',
                border: 'none',
                borderBottom: '1px solid var(--border-light)',
                background: s.businessId === businessId ? 'rgba(139,92,246,0.12)' : 'transparent',
                color: 'var(--text-main)',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              {s.businessName}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              navigate('/owner/stores');
            }}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: '12px 14px',
              border: 'none',
              background: 'transparent',
              color: 'var(--secondary)',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Manage all stores…
          </button>
        </div>
      )}
    </div>
  );
}

