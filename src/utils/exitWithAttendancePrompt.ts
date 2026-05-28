import { showAttendanceExit } from '../store/dialogStore';

/**
 * If the user is clocked in, prompts whether to clock out before leaving (logout / quit).
 * @returns `proceed` — caller may exit; `cancel` — stay signed in / keep window open.
 */
export async function promptClockOutBeforeExit(userId: number): Promise<'proceed' | 'cancel'> {
  if (!window.sikapos?.attendance) return 'proceed';
  try {
    const status = await window.sikapos.attendance.getStatus(userId);
    if (!status || status.type !== 'in') return 'proceed';

    const choice = await showAttendanceExit(
      'You are currently clocked in. Do you want to clock out before logging out/exiting?',
      'Active Shift'
    );

    if (choice === 'cancel') return 'cancel';

    if (choice === 'clock_out') {
      await window.sikapos.attendance.clockOut(userId);
      window.dispatchEvent(new Event('attendance-changed'));
    }

    // Both 'clock_out' and 'stay_in' mean we proceed with the exit/logout
    return 'proceed';
  } catch {
    // Do not block exit if attendance fails
    return 'proceed';
  }
}
