const TEXTURE_KEYS = [
  'map', 'alphaMap', 'aoMap', 'bumpMap', 'displacementMap', 'emissiveMap',
  'envMap', 'lightMap', 'metalnessMap', 'normalMap', 'roughnessMap',
];

function disposeMaterial(material, disposed) {
  if (!material || disposed.has(material)) return;
  disposed.add(material);
  for (const key of TEXTURE_KEYS) {
    const texture = material[key];
    if (texture?.isTexture && !disposed.has(texture)) {
      disposed.add(texture);
      texture.dispose();
    }
  }
  for (const uniform of Object.values(material.uniforms || {})) {
    const texture = uniform?.value;
    if (texture?.isTexture && !disposed.has(texture)) {
      disposed.add(texture);
      texture.dispose();
    }
  }
  material.dispose?.();
}

export function disposeThreeRuntime({
  scene,
  controls,
  composer,
  renderer,
  extraRoots = [],
}) {
  const disposed = new Set();
  const roots = [scene, ...extraRoots].filter(Boolean);
  for (const root of roots) {
    root.traverse?.(object => {
      if (object.geometry && !disposed.has(object.geometry)) {
        disposed.add(object.geometry);
        object.geometry.dispose();
      }
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) disposeMaterial(material, disposed);
      if (object.isCSS2DObject) object.element?.remove();
    });
  }
  controls?.dispose?.();
  composer?.dispose?.();
  renderer?.renderLists?.dispose?.();
  renderer?.dispose?.();
  renderer?.forceContextLoss?.();
  renderer?.domElement?.remove();
}
