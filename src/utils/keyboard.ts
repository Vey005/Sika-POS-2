/** True when the key event target is a form control where typing should not be overridden by global shortcuts. */
export function isTypingInEditableField(target: EventTarget | null): boolean {
  const el = target;
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const input = el as HTMLInputElement;
    const type = (input.type || '').toLowerCase();
    if (
      type === 'checkbox' ||
      type === 'radio' ||
      type === 'button' ||
      type === 'submit' ||
      type === 'reset' ||
      type === 'file' ||
      type === 'hidden'
    ) {
      return false;
    }
    return !input.readOnly && !input.disabled;
  }
  return false;
}
