// Phone / browser Back button = in-game Back. Every screen and panel with
// a Back button already handles Esc, so a Back press is turned into an
// Esc keydown. Off the title screen one extra history entry (the guard)
// sits on top of the page; Back pops it, we send Esc and push it again.
// On the title screen the guard is dropped, so Back leaves the page.

export function createBackButton({ win = window, doc = document } = {}) {
  const history = win.history;
  let armed = false;
  let ignorePops = 0; // pops we caused ourselves (dropping the guard)

  function arm() {
    if (armed) return;
    armed = true;
    try {
      history.pushState({ foldworkGuard: true }, '');
    } catch {
      armed = false;
    }
  }

  function disarm() {
    if (!armed) return;
    armed = false;
    ignorePops++;
    history.back();
  }

  /** Where the Esc goes: the open dialog (focus inside it if any), else focus. */
  function escTarget() {
    const active = doc.activeElement;
    const dialogs = doc.querySelectorAll('[aria-modal="true"]');
    const dialog = dialogs[dialogs.length - 1];
    if (dialog) return dialog.contains(active) ? active : dialog;
    return active && active !== doc.body ? active : doc.body;
  }

  function onPop() {
    if (ignorePops > 0) {
      ignorePops--;
      return;
    }
    if (!armed) return; // title screen: the browser leaves as usual
    armed = false; // the guard was just popped
    escTarget().dispatchEvent(new win.KeyboardEvent('keydown', {
      key: 'Escape', code: 'Escape', bubbles: true, cancelable: true,
    }));
    // Esc may have changed screens (screenChanged re-arms); otherwise
    // stay put with a fresh guard, unless we're on the title screen.
    if (!armed && current !== 'title') arm();
  }

  let current = null;
  win.addEventListener('popstate', onPop);

  return {
    /** Call on each screen change (router onGo). */
    screenChanged(name) {
      current = name;
      if (name === 'title') disarm();
      else arm();
    },
  };
}
