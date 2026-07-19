import './styles/global.css';
import { startHashRouter } from './router.js';
import { startMusic } from './audio.js';
import { sceneForPath } from './audio-helpers.js';

const music = startMusic({ preview: document.documentElement.classList.contains('preview') });
music.mountPlayer();

const router = startHashRouter({
  root: document.getElementById('app'),
  fade: document.getElementById('routeFade'),
  loaders: {
    solar: () => import('./pages/solar/page.js'),
    'big-bang': () => import('./pages/big-bang/page.js'),
  },
  onRoute: route => music.setScene(sceneForPath(route.path)),
});

window.cosmicX = {
  navigate: router.navigate,
  audio: music,
  get route() { return router.activeRoute; },
};
