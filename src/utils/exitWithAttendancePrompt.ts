import { showConfirm } from '../store/dialogStore';

/**
 * If the user is clocked in, prompts whether to clock out before leaving (logout / quit).
 * @returns `proceed` — caller may exit; `cancel` — stay signed in / keep window open.
 */
export async function promptClockOutBeforeExit(userId: number): Promise<'proceed' | 'cancel'> {
  if (!window.sikapos?.attendance) return 'proceed';
  try {
    const status = await window.sikapos.attendance.getStatus(userId);
    if (!status || status.type !== 'in') return 'proceed';

    const ok = await showConfirm(
      'You are still clocked in.\n\n' +
        'Click OK to clock out and continue, or Cancel to stay signed in.'
    );
    if (!ok) return 'cancel';

    await window.sikapos.attendance.clockOut(userId);
    window.dispatchEvent(new Event('attendance-changed'));
    return 'proceed';
  } catch {
    // Do not block exit if attendance fails
    return 'proceed';
  }
}
