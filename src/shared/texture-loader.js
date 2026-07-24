// Progressive remote-texture upgrader shared by Solar and Big Bang. The
// procedural canvas texture shows instantly; the real map swaps in when the CDN
// answers; offline/404 keeps the procedural fallback. renderer + destroyed flag
// are injected as getters because they live in each runtime's closure.

export function createTextureUpgrader(THREE, { baseUrl, getRenderer, isDestroyed }) {
  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin('anonymous');
  return function upgradeTexture(material, file, slot = 'map', asColor = true) {
    if (!file) return;
    loader.load(baseUrl + file, (tex) => {
      if (isDestroyed()) { tex.dispose(); return; }   // late arrival after teardown
      if (asColor) tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = getRenderer().capabilities.getMaxAnisotropy();
      material[slot] = tex;
      if (slot === 'bumpMap') material.bumpScale = 0.05;
      material.needsUpdate = true;
    }, undefined, () => { /* offline / 404 → keep procedural fallback */ });
  };
}
