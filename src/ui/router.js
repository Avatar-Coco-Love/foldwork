// Screen router. A screen is { mount(root, ctx, params) } returning an
// optional cleanup function. Only one screen is mounted at a time.

export function createRouter(root, ctx) {
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
      const cleanup = screen.mount(root, ctx, params);
      current = { name, cleanup: typeof cleanup === 'function' ? cleanup : null };
    },
  };
  return router;
}
