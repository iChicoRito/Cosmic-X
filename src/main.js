import './styles/global.css';
import { startHashRouter } from './router.js';

const router = startHashRouter({
  root: document.getElementById('app'),
  fade: document.getElementById('routeFade'),
  loaders: {
    solar: () => import('./pages/solar/page.js'),
    'big-bang': () => import('./pages/big-bang/page.js'),
  },
});

window.cosmicX = {
  navigate: router.navigate,
  get route() { return router.activeRoute; },
};
