export type UserFeedbackKind = 'error' | 'info';

export interface UserFeedbackDetail {
  kind: UserFeedbackKind;
  title: string;
  message: string;
}

const TECHNICAL_ERROR = /(?:sqlite(?:_|\s)|sql(?:ite)?\s+error|constraint failed|referenceerror|typeerror|syntaxerror|cannot (?:read|access) (?:properties|table)|before initialization|undefined is not|json\.parse|stack trace|\bat \S+ \(|ipc(?:renderer)?|no such table|database is locked|better-sqlite3|econnrefused|errno)/i;
let lastFeedbackKey = '';
let lastFeedbackAt = 0;

/**
 * Keeps implementation details (Electron, SQLite and JavaScript errors) out of
 * the operator UI while preserving clear business-rule messages from the app.
 */
export function toUserErrorMessage(error: unknown, fallback = 'We could not complete that action. Please review the details and try again.'): string {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const message = raw
    .replace(/^error invoking remote method\s+['"][^'"]+['"]:\s*/i, '')
    .replace(/^error:\s*/i, '')
    .trim();

  if (!message || TECHNICAL_ERROR.test(message)) return fallback;
  return message.length > 360 ? fallback : message;
}

export function showUserFeedback(detail: UserFeedbackDetail): void {
  if (typeof window === 'undefined') return;
  const key = `${detail.kind}:${detail.title}:${detail.message}`;
  const now = Date.now();
  // A service failure is often caught again by the screen that started it.
  // Avoid showing the same dialog twice for that one user action.
  if (key === lastFeedbackKey && now - lastFeedbackAt < 800) return;
  lastFeedbackKey = key;
  lastFeedbackAt = now;
  window.dispatchEvent(new CustomEvent<UserFeedbackDetail>('restoflow:user-feedback', { detail }));
}

export function showUserError(error: unknown, fallback?: string, title = 'Action needs attention'): string {
  const message = toUserErrorMessage(error, fallback);
  // Retain the original diagnostic in developer tools without exposing it in the operator UI.
  if (error) console.error('[RestoFlow action failed]', error);
  showUserFeedback({ kind: 'error', title, message });
  return message;
}

export function showUserInfo(message: string, title = 'Please note'): void {
  showUserFeedback({ kind: 'info', title, message });
}
