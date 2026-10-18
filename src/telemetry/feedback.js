// Send Feedback / Report a Bug (9j): the `feedback` event's data, built
// from what the player typed and where they were. Pure (no DOM), so the
// form (ui/feedback.js) stays thin and this is tested in Node.
//
// Feedback goes through the telemetry queue like any event (offline-safe,
// NEVER_TRIM), and is sent even with "Share play data" off (ALWAYS_SEND
// in telemetry.js; OPEN-QUESTIONS "Offline: does feedback follow 'Share
// play data'?"). What it carries is listed on the Privacy screen
// (ui/privacy.js); change both together.

/** The form's kinds, in button order. */
export const FEEDBACK_KINDS = Object.freeze([
  { id: 'bug', name: 'Bug' },
  { id: 'idea', name: 'Idea' },
  { id: 'other', name: 'Something else' },
]);

/** Longest message, in characters (the form's maxlength too). */
export const FEEDBACK_MAX = 1000;

/** What replaces an email address typed into a message. */
export const EMAIL_MARK = '[email removed]';

const EMAIL = /[^\s@<>()[\]",;:]+@[^\s@<>()[\]",;:]+\.[a-z]{2,}/gi;

/** The message as sent: trimmed, emails removed, capped at FEEDBACK_MAX. */
export function cleanMessage(text) {
  return String(text ?? '').replace(EMAIL, EMAIL_MARK).trim().slice(0, FEEDBACK_MAX);
}

/**
 * The run context a note is tagged with when sent from a floor (the pause
 * menu, or Settings over the board), from that floor's telemetry tag: the
 * floor, its template and variant, the spirit, and the turn. Null outside
 * a floor.
 */
export function feedbackContext(floorTag, turn = null) {
  if (!floorTag) return null;
  return {
    floor: floorTag.floor ?? null,
    templateId: floorTag.templateId ?? null,
    variant: floorTag.variant ?? null,
    spirit: (floorTag.loadout && floorTag.loadout.spirit) || null,
    seed: floorTag.seed ?? null,
    turn,
  };
}

/**
 * The `feedback` event's data, or null when there is nothing to send (an
 * empty message). `device` is the small device summary the Privacy screen
 * names (feedbackDevice in telemetry/browser.js); `from` is where the form
 * was opened ('settings' or 'pause').
 */
export function feedbackData({ kind, text, from = 'settings', context = null, device = null }) {
  const message = cleanMessage(text);
  if (!message) return null;
  return {
    kind: FEEDBACK_KINDS.some((k) => k.id === kind) ? kind : 'other',
    message,
    from,
    context,
    device,
  };
}
