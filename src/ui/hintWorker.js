// Module Web Worker for the Hint button: runs core/hintLine.js findLine()
// off the main thread. Message in: { id, state }; out: { id, result }.

import { findLine } from '../core/hintLine.js';

self.onmessage = (e) => {
  const { id, state } = e.data;
  let result;
  try {
    result = findLine(state);
  } catch {
    result = { status: 'unknown' };
  }
  self.postMessage({ id, result });
};
