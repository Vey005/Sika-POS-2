import styles from './TransactionSearchBar.module.css';

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  shown?: number;
  total?: number;
}

export default function TransactionSearchBar({
  value,
  onChange,
  placeholder = 'Search receipt, customer, cashier, payment…',
  shown,
  total,
}: Props) {
  const hasFilter = value.trim().length > 0;
  const countLabel =
    shown != null && total != null && hasFilter ? `${shown} of ${total}` : null;

  return (
    <div className={styles.row}>
      <div className={styles.inputWrap}>
        <svg className={styles.icon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="search"
          className={styles.input}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label="Search transactions"
        />
        {value && (
          <button
            type="button"
            className={styles.clearBtn}
            onClick={() => onChange('')}
            aria-label="Clear search"
          >
            ×
          </button>
        )}
      </div>
      {countLabel != null && (
        <span className={styles.count}>{countLabel} transaction{countLabel === '1' ? '' : 's'}</span>
      )}
    </div>
  );
}
