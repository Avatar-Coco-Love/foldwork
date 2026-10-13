// Board input: drag-to-fold (Pointer Events: mouse, touch, pen share one
// path), keyboard fold mode, and tap / key moves. A thin layer: gesture math
// lives in foldGesture.js and moveInput.js; the owner (floor screen)
// validates, previews and applies.
//
// Callbacks:
//   onPreview(crease | null)  crease under the gesture changed (null = none)
//   onConfirm(crease) → bool  release / Enter; return false if the fold was
//                             rejected (input then reports it via onInvalid)
//   onInvalid()               a release or Enter on an invalid fold
//   onUndo()                  U / Z
//   onMove(dir)               arrows / WASD (outside fold mode)
//   onTap(cell)               a tap on a board cell
//   onWait()                  Space
//   onHint()                  H
//   onRestart()               R (outside fold mode; the owner confirms)
//   foldOptions() → { diagonal }  whether diagonal creases are unlocked
//
// setBusy(true) (during animations) blocks starting a fold, since its
// preview would be of a board that is still moving, but still reports taps
// and keys so the owner can buffer one action.
//
// Controls (docs/04-ui-input-visuals.md):
//   drag on board → preview; release confirms; drag off board, right click,
//   Esc or the HUD Cancel button aborts.
//   F enters keyboard fold mode; arrows/WASD move the crease; F flips the
//   folding side; R turns it to the next axis when diagonals are unlocked;
//   Enter confirms; Esc cancels. With diagonals, a drag near 45° folds
//   along a diagonal.

import { creaseFromDrag, isOffBoard, defaultCrease, stepCrease, sameCrease } from './foldGesture.js';
import { dirForKey, isTap } from './moveInput.js';
import { cellAtPoint } from '../render/layout.js';

export function createFoldInput({
  canvas, getLayout, getBoard, onPreview, onConfirm, onInvalid, onUndo, onMove, onTap, onWait, onHint, onRestart,
  foldOptions = () => ({}),
}) {
  let enabled = true;
  let busy = false;
  let drag = null; // { pointerId, start: {x,y}, crease, off, tap, foldable }
  let keyCrease = null; // crease while in keyboard fold mode
  let shown = null; // last crease sent to onPreview

  function show(crease) {
    if (sameCrease(crease, shown)) return;
    shown = crease;
    onPreview(crease);
  }

  function confirm(crease) {
    if (crease && onConfirm(crease) === false) onInvalid();
  }

  function cancel() {
    const held = drag;
    drag = null; // clear first: releasing capture fires lostpointercapture
    if (held) {
      try { canvas.releasePointerCapture(held.pointerId); } catch { /* already released */ }
    }
    keyCrease = null;
    show(null);
  }

  function point(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onPointerDown(e) {
    if (drag && e.pointerId !== drag.pointerId) {
      // A second button/finger while dragging: right click aborts.
      if (e.button === 2) cancel();
      return;
    }
    if (!enabled || e.button !== 0 || !e.isPrimary) return;
    const layout = getLayout();
    const p = point(e);
    if (!layout || !cellAtPoint(layout, p.x, p.y)) return;
    keyCrease = null;
    drag = { pointerId: e.pointerId, start: p, crease: null, off: false, tap: true, foldable: !busy };
    canvas.setPointerCapture?.(e.pointerId);
    show(null);
  }

  function onPointerMove(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const layout = getLayout();
    if (!layout) return;
    const p = point(e);
    if (drag.tap && !isTap(layout, drag.start, p)) drag.tap = false; // once a drag, never a tap
    if (!drag.foldable) return;
    drag.off = isOffBoard(layout, p.x, p.y);
    drag.crease = drag.off ? null : creaseFromDrag(layout, drag.start, p, foldOptions());
    show(drag.crease);
  }

  function onPointerUp(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const held = drag;
    drag = null;
    show(null);
    if (held.tap) {
      const layout = getLayout();
      const cell = layout && cellAtPoint(layout, held.start.x, held.start.y);
      if (cell && onTap) onTap(cell);
      return;
    }
    if (held.foldable) confirm(held.off ? null : held.crease);
  }

  function onPointerCancel(e) {
    if (drag && e.pointerId === drag.pointerId) cancel();
  }

  function onContextMenu(e) {
    e.preventDefault();
    if (drag) cancel();
  }

  function onKeyDown(e) {
    if (!enabled || e.ctrlKey || e.metaKey || e.altKey) return;
    const board = getBoard();
    if (!board) return;
    const key = e.key;
    // Space / Enter on a focused button belong to the button (it clicks).
    if ((key === ' ' || key === 'Enter') && e.target && e.target.closest && e.target.closest('button')) return;

    if (keyCrease) {
      if (key === 'Escape') {
        cancel();
      } else if (key === 'Enter') {
        const crease = keyCrease;
        keyCrease = null;
        show(null);
        confirm(crease);
      } else {
        const next = stepCrease(board, keyCrease, key, foldOptions());
        if (next === keyCrease && !/^Arrow/.test(key)) return; // not ours
        keyCrease = next;
        show(keyCrease);
      }
      e.preventDefault();
      return;
    }

    if (drag) {
      if (key === 'Escape') {
        cancel();
        e.preventDefault();
      }
      return;
    }

    const dir = dirForKey(key);
    if (key === 'f' || key === 'F') {
      if (busy) return;
      keyCrease = defaultCrease(board);
      show(keyCrease);
      e.preventDefault();
    } else if (key === 'u' || key === 'U' || key === 'z' || key === 'Z') {
      onUndo();
      e.preventDefault();
    } else if (dir) {
      if (onMove) onMove(dir);
      e.preventDefault();
    } else if (key === ' ') {
      if (onWait) onWait();
      e.preventDefault();
    } else if ((key === 'h' || key === 'H') && onHint && !e.repeat) {
      onHint();
      e.preventDefault();
    } else if ((key === 'r' || key === 'R') && onRestart && !e.repeat) {
      onRestart();
      e.preventDefault();
    }
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerCancel);
  canvas.addEventListener('lostpointercapture', onPointerCancel);
  canvas.addEventListener('contextmenu', onContextMenu);
  window.addEventListener('keydown', onKeyDown);

  return {
    cancel,
    /** Ignore all input (e.g. once the floor has ended). Cancels any gesture. */
    setEnabled(value) {
      enabled = !!value;
      if (!enabled) cancel();
    },
    /** While busy, folds can't start; taps and keys still report. */
    setBusy(value) {
      busy = !!value;
      // Drop a fold in progress, but keep a tap that is mid-press.
      if (busy && (keyCrease || (drag && drag.foldable))) cancel();
    },
    get active() {
      return !!(drag || keyCrease);
    },
    destroy() {
      cancel();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerCancel);
      canvas.removeEventListener('lostpointercapture', onPointerCancel);
      canvas.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('keydown', onKeyDown);
    },
  };
}
