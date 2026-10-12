// Screen router. A screen is { mount(root, ctx, params) } returning an
// optional cleanup function. Only one screen is mounted at a time.
// `onGo(name, params)` is called on each screen change, just before the
// new screen mounts (telemetry).

export function createRouter(root, ctx, { onGo = null } = {}) {
  const screens = new Map();
  let current = null; // { name, cleanup }

  const router = {
    register(name, screen) {
      screens.set(name, screen);
      return router;
    },
    has(name) {
      return screens.has(name);
    },
    get current() {
      return current ? current.name : null;
    },
    go(name, params = {}) {
      const screen = screens.get(name);
      if (!screen) throw new Error(`Unknown screen: ${name}`);
      if (current && current.cleanup) current.cleanup();
      root.replaceChildren();
      root.dataset.screen = name;
      if (onGo) onGo(name, params);
      const cleanup = screen.mount(root, ctx, params);
      current = { name, cleanup: typeof cleanup === 'function' ? cleanup : null };
    },
  };
  return router;
}
