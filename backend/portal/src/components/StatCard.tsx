// Icon component type

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  color?: 'primary' | 'secondary' | 'success' | 'danger';
}

const colorMap = {
  primary: { bg: 'rgba(139, 92, 246, 0.1)', icon: '#8B5CF6' },
  secondary: { bg: 'rgba(212, 160, 23, 0.1)', icon: '#D4A017' },
  success: { bg: 'rgba(16, 185, 129, 0.1)', icon: '#10B981' },
  danger: { bg: 'rgba(239, 68, 68, 0.1)', icon: '#EF4444' },
};

export default function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  trendValue,
  color = 'primary',
}: StatCardProps) {
  const colors = colorMap[color];

  return (
    <div
      className="glass-panel"
      style={{
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: colors.bg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon size={24} color={colors.icon} />
        </div>
        {trend && trendValue && (
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '13px',
              fontWeight: 500,
              color: trend === 'up' ? 'var(--success)' : trend === 'down' ? 'var(--danger)' : 'var(--text-muted)',
            }}
          >
            {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'} {trendValue}
          </span>
        )}
      </div>

      <div>
        <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '4px' }}>{title}</p>
        <p style={{ fontSize: '28px', fontWeight: 600, fontFamily: 'Outfit', margin: 0 }}>{value}</p>
        {subtitle && <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>{subtitle}</p>}
      </div>
    </div>
  );
}
