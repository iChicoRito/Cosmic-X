import styles from './solar.css?inline';
import { createSolarRuntime } from './runtime.js';
import { solarTemplate } from './template.js';

export function mount({ root, route, navigate, replaceRoute }) {
  root.innerHTML = `<style data-route-style="solar">${styles}</style>${solarTemplate()}`;
  let runtime;
  try {
    runtime = createSolarRuntime({
      root,
      navigate,
      replaceRoute,
      initialView: route.view,
    });
  } catch (error) {
    root.replaceChildren();
    throw error;
  }

  let destroyed = false;
  return {
    setView: runtime.setView,
    pause: runtime.pause,
    resume: runtime.resume,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      runtime.destroy();
      root.replaceChildren();
    },
  };
}
