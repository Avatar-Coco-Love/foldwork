// Board input: drag-to-fold (Pointer Events: mouse, touch, pen share one
// path) and keyboard fold mode. A thin layer: gesture math lives in
// foldGesture.js; the owner (floor screen) validates, previews and applies.
//
// Callbacks:
//   onPreview(crease | null)  crease under the gesture changed (null = none)
//   onConfirm(crease) → bool  release / Enter; return false if the fold was
//                             rejected (input then reports it via onInvalid)
//   onInvalid()               a release or Enter on an invalid fold
//   onUndo()                  U / Z
//
// Controls (docs/04-ui-input-visuals.md):
//   drag on board → preview; release confirms; drag off board, right click,
//   Esc or the HUD Cancel button aborts.
//   F enters keyboard fold mode; arrows/WASD move the crease; F flips the
//   folding side; Enter confirms; Esc cancels.

import { creaseFromDrag, isOffBoard, defaultCrease, stepCrease, sameCrease } from './foldGesture.js';
import { cellAtPoint } from '../render/layout.js';

export function createFoldInput({ canvas, getLayout, getBoard, onPreview, onConfirm, onInvalid, onUndo }) {
  let enabled = true;
  let drag = null; // { pointerId, start: {x,y}, crease, off }
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
    drag = { pointerId: e.pointerId, start: p, crease: null, off: false };
    canvas.setPointerCapture?.(e.pointerId);
    show(null);
  }

  function onPointerMove(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const layout = getLayout();
    if (!layout) return;
    const p = point(e);
    drag.off = isOffBoard(layout, p.x, p.y);
    drag.crease = drag.off ? null : creaseFromDrag(layout, drag.start, p);
    show(drag.crease);
  }

  function onPointerUp(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const crease = drag.off ? null : drag.crease;
    drag = null;
    show(null);
    confirm(crease);
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

    if (keyCrease) {
      if (key === 'Escape') {
        cancel();
      } else if (key === 'Enter') {
        const crease = keyCrease;
        keyCrease = null;
        show(null);
        confirm(crease);
      } else {
        const next = stepCrease(board, keyCrease, key);
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

    if (key === 'f' || key === 'F') {
      keyCrease = defaultCrease(board);
      show(keyCrease);
      e.preventDefault();
    } else if (key === 'u' || key === 'U' || key === 'z' || key === 'Z') {
      onUndo();
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
    /** Ignore new input (e.g. during animations). Cancels any gesture. */
    setEnabled(value) {
      enabled = !!value;
      if (!enabled) cancel();
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
