const ROUTES = new Map([
  ['/', { page: 'solar', view: 'title' }],
  ['/modes', { page: 'solar', view: 'modes' }],
  ['/solar-system', { page: 'solar', view: 'simulation' }],
  ['/creator', { page: 'creator', view: 'title' }],
  ['/big-bang', { page: 'big-bang', view: 'title' }],
]);

export function resolveRoute(hash = '') {
  const raw = String(hash);
  const legacy = raw === '#modes';
  const path = legacy ? '/modes' : (raw.replace(/^#/, '') || '/');
  const canonical = ROUTES.has(path) ? path : '/';
  const route = ROUTES.get(canonical);
  return {
    path: canonical,
    page: route.page,
    view: route.view,
    replace: legacy || path !== canonical || raw === '',
  };
}

export function createRouteManager({
  root,
  loaders,
  navigate = () => {},
  replaceRoute = () => {},
  transition = swap => swap(),
}) {
  let active = null;
  let requested = null;
  let running = null;
  let generation = 0;

  const drain = async () => {
    while (requested) {
      const request = requested;
      requested = null;
      const { route, token } = request;

      if (active?.page === route.page) {
        await active.instance.setView?.(route.view, route);
        active.route = route;
        continue;
      }

      const pageModule = await loaders[route.page]();
      if (token !== generation) continue;

      await transition(async () => {
        if (token !== generation) return;
        if (active) {
          await active.instance.destroy?.();
          active = null;
        }

        const instance = await pageModule.mount({
          root,
          route,
          navigate,
          replaceRoute,
        });
        if (token !== generation) {
          await instance?.destroy?.();
          return;
        }
        active = { page: route.page, route, instance: instance || {} };
      });
    }
  };

  return {
    activate(route) {
      requested = { route, token: ++generation };
      if (!running) {
        running = drain().finally(() => { running = null; });
      }
      return running;
    },
    pause() { active?.instance.pause?.(); },
    resume() { active?.instance.resume?.(); },
    get activeRoute() { return active?.route || null; },
    async destroy() {
      requested = null;
      generation++;
      await running;
      if (active) await active.instance.destroy?.();
      active = null;
    },
  };
}

export function startHashRouter({
  root,
  fade,
  loaders,
  win = window,
  onRoute = () => {},
}) {
  const listeners = new AbortController();
  const delay = ms => new Promise(resolve => win.setTimeout(resolve, ms));

  let manager;
  const showRouteError = error => {
    console.error(error);
    root.innerHTML = '<main class="route-error"><h1>Simulation failed to load</h1><button type="button">Return to CosmicX</button></main>';
    root.querySelector('button')?.addEventListener('click', () => navigate('/'));
    fade.classList.remove('active');
  };
  const activateLocation = async () => {
    const route = resolveRoute(win.location.hash);
    if (route.replace) {
      win.history.replaceState(null, '', `${win.location.pathname}${win.location.search}#${route.path}`);
    }
    win.document.body.dataset.route = route.page;
    onRoute(route);
    await manager.activate(route);
  };
  const navigate = (path, { replace = false } = {}) => {
    const next = `#${path}`;
    if (replace) {
      win.history.replaceState(null, '', `${win.location.pathname}${win.location.search}${next}`);
      return activateLocation();
    }
    if (win.location.hash === next) return activateLocation();
    win.location.hash = next;
    return undefined;
  };

  manager = createRouteManager({
    root,
    loaders,
    navigate,
    replaceRoute: path => navigate(path, { replace: true }),
    transition: async swap => {
      fade.classList.add('active');
      await delay(180);
      try {
        await swap();
      } finally {
        fade.classList.remove('active');
      }
    },
  });

  const activateSafely = () => activateLocation().catch(showRouteError);
  win.addEventListener('hashchange', activateSafely, { signal: listeners.signal });
  win.addEventListener('message', event => {
    if (event.data === 'cosmicx:preview:pause') manager.pause();
    if (event.data === 'cosmicx:preview:resume') manager.resume();
  }, { signal: listeners.signal });

  activateSafely();

  return {
    navigate,
    get activeRoute() { return manager.activeRoute; },
    async destroy() {
      listeners.abort();
      await manager.destroy();
      delete win.document.body.dataset.route;
    },
  };
}
