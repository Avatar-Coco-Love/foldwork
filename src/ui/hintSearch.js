// Runs hint searches (core/hintLine.js findLine) in a module Web Worker,
// one at a time. A new search replaces one still running: its worker is
// stopped (a search can't be interrupted from outside) and its promise
// resolves to null. Where module workers aren't available the search runs
// on the main thread instead, after a tick so the "thinking" note paints.

import { findLine } from '../core/hintLine.js';

export function createHintSearch() {
  let worker = null;
  let pending = null; // { id, state, resolve }
  let nextId = 1;
  let workers = typeof Worker === 'function';

  function stop() {
    if (worker) worker.terminate();
    worker = null;
  }

  function settle(id, result) {
    if (!pending || pending.id !== id) return;
    const { resolve } = pending;
    pending = null;
    resolve(result);
  }

  function onMainThread(job) {
    setTimeout(() => {
      if (!pending || pending.id !== job.id) return;
      let result;
      try {
        result = findLine(job.state);
      } catch {
        result = { status: 'unknown' };
      }
      settle(job.id, result);
    }, 30);
  }

  function spawn() {
    try {
      const w = new Worker(new URL('./hintWorker.js', import.meta.url), { type: 'module' });
      w.onmessage = (e) => settle(e.data.id, e.data.result);
      // Module workers unsupported (or the worker failed to load): finish
      // this search, and later ones, on the main thread.
      w.onerror = (e) => {
        if (e && e.preventDefault) e.preventDefault();
        workers = false;
        stop();
        if (pending) onMainThread(pending);
      };
      return w;
    } catch {
      workers = false;
      return null;
    }
  }

  return {
    /** Search from `state` (plain FloorState). Resolves to findLine()'s result, or null if replaced. */
    search(state) {
      if (pending) {
        stop();
        settle(pending.id, null);
      }
      const job = { id: nextId++, state };
      const promise = new Promise((resolve) => {
        job.resolve = resolve;
      });
      pending = job;
      if (workers && !worker) worker = spawn();
      if (worker) worker.postMessage({ id: job.id, state });
      else onMainThread(job);
      return promise;
    },
    get busy() {
      return !!pending;
    },
    destroy() {
      stop();
      if (pending) settle(pending.id, null);
    },
  };
}
