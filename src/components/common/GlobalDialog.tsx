import React, { useEffect, useRef } from 'react';
import { useDialogStore } from '../../store/dialogStore';
import styles from './GlobalDialog.module.css';

export default function GlobalDialog() {
  const { currentDialog, closeDialog } = useDialogStore();
  const confirmBtnRef = React.useRef<HTMLButtonElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [promptValue, setPromptValue] = React.useState('');

  // Reset prompt value when dialog opens
  React.useEffect(() => {
    if (currentDialog?.type === 'prompt') {
      setPromptValue(currentDialog.defaultValue || '');
    }
  }, [currentDialog]);

  // Focus the confirm button on mount, handle escape/enter
  useEffect(() => {
    if (!currentDialog) return;

    // Focus confirm button so user can just press Enter
    // For prompt, focus the input instead
    if (currentDialog.type === 'prompt' && inputRef.current) {
      inputRef.current.focus();
    } else if (confirmBtnRef.current) {
      confirmBtnRef.current.focus();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (currentDialog.type === 'attendanceExit') {
          closeDialog('cancel');
        } else {
          closeDialog(currentDialog.type === 'prompt' ? null : false);
        }
      } else if (e.key === 'Enter') {
        // If alert, we can just close on Enter. 
        if (currentDialog.type === 'alert') {
          e.preventDefault();
          closeDialog(true);
        } else if (currentDialog.type === 'prompt') {
          // Allow prompt to be submitted with Enter if not multiline
          e.preventDefault();
          closeDialog(promptValue);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentDialog, closeDialog, promptValue]);

  if (!currentDialog) return null;

  const isConfirm = currentDialog.type === 'confirm' || currentDialog.type === 'prompt' || currentDialog.type === 'attendanceExit';
  const isPrompt = currentDialog.type === 'prompt';

  return (
    <div className={styles.overlay}>
      <div 
        className={styles.modal} 
        role="dialog" 
        aria-modal="true"
        aria-labelledby="dialog-title"
      >
        <div className={styles.header}>
          <div className={`${styles.icon} ${isConfirm ? styles.iconConfirm : styles.iconAlert}`}>
            {isConfirm ? '?' : '!'}
          </div>
          <h2 id="dialog-title" className={styles.title}>{currentDialog.title}</h2>
        </div>
        
        <div className={styles.content}>
          {currentDialog.message}
          {isPrompt && (
            <input
              ref={inputRef}
              type="text"
              style={{
                width: '100%',
                marginTop: '12px',
                padding: '10px 14px',
                background: 'var(--color-overlay)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--color-text-primary)',
                fontFamily: 'inherit',
                fontSize: '14px',
              }}
              value={promptValue}
              onChange={(e) => setPromptValue(e.target.value)}
            />
          )}
        </div>

        <div className={styles.actions}>
          {currentDialog.type === 'attendanceExit' ? (
            <>
              <button
                className={styles.btnCancel}
                onClick={() => closeDialog('cancel')}
              >
                Cancel
              </button>
              <button
                className={styles.btnSecondary}
                onClick={() => closeDialog('stay_in')}
              >
                Stay Clocked In
              </button>
              <button
                className={styles.btnConfirm}
                onClick={() => closeDialog('clock_out')}
              >
                Clock Out
              </button>
            </>
          ) : (
            <>
              {isConfirm && (
                <button
                  className={styles.btnCancel}
                  onClick={() => closeDialog(isPrompt ? null : false)}
                >
                  Cancel
                </button>
              )}
              <button
                ref={confirmBtnRef}
                className={styles.btnConfirm}
                onClick={() => closeDialog(isPrompt ? promptValue : true)}
              >
                OK
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
