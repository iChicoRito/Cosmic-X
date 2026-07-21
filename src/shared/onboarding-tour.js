export const ONBOARDING_KEYS = Object.freeze({
  solar: 'cosmicx.onboarding.solar.v1',
  creator: 'cosmicx.onboarding.creator.v1',
});

const completedInSession = new Set();

export function hasCompletedOnboarding(storageKey, storage = globalThis.localStorage) {
  if (completedInSession.has(storageKey)) return true;
  try {
    return storage?.getItem(storageKey) === '1';
  } catch {
    return false;
  }
}

export function markOnboardingComplete(storageKey, storage = globalThis.localStorage) {
  try {
    if (!storage?.setItem) throw new Error('storage unavailable');
    storage.setItem(storageKey, '1');
  } catch {
    completedInSession.add(storageKey);
  }
}

const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));

export function computeTourCardPosition(target, card, viewport) {
  const padding = 16;
  const gap = 18;
  const width = Math.min(card.width, viewport.width - padding * 2);
  const height = Math.min(card.height, viewport.height - padding * 2);
  const centeredTop = clamp((target.top + target.bottom - height) / 2, padding, viewport.height - height - padding);

  if (viewport.width > 640 && viewport.width - target.right >= width + gap) {
    return { left: target.right + gap, top: centeredTop, placement: 'right' };
  }
  if (viewport.width > 640 && target.left >= width + gap) {
    return { left: target.left - width - gap, top: centeredTop, placement: 'left' };
  }

  const left = clamp((target.left + target.right - width) / 2, padding, viewport.width - width - padding);
  if (viewport.height - target.bottom >= height + gap) {
    return { left, top: target.bottom + gap, placement: 'bottom' };
  }
  if (target.top >= height + gap) {
    return { left, top: target.top - height - gap, placement: 'top' };
  }
  return {
    left: clamp((viewport.width - width) / 2, padding, viewport.width - width - padding),
    top: clamp((viewport.height - height) / 2, padding, viewport.height - height - padding),
    placement: 'center',
  };
}

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

export function startOnboardingTour({
  appRoot,
  steps,
  storage = globalThis.localStorage,
  storageKey,
  onStart = () => {},
  onEnd = () => {},
}) {
  if (!appRoot || !steps?.length || !storageKey || hasCompletedOnboarding(storageKey, storage)) return null;

  const previousFocus = document.activeElement;
  const previousInert = appRoot.inert;
  let index = 0;
  let frame = 0;
  let ended = false;

  const overlay = makeElement('section', 'onboarding-tour');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'onboardingTourTitle');
  overlay.setAttribute('aria-describedby', 'onboardingTourDescription');

  const shield = makeElement('div', 'onboarding-tour__shield');
  const spotlight = makeElement('div', 'onboarding-tour__spotlight');
  const card = makeElement('div', 'onboarding-tour__card');
  const progress = makeElement('p', 'onboarding-tour__progress');
  const title = makeElement('h2', 'onboarding-tour__title');
  title.id = 'onboardingTourTitle';
  const description = makeElement('p', 'onboarding-tour__description');
  description.id = 'onboardingTourDescription';
  const next = makeElement('button', 'onboarding-tour__next');
  next.type = 'button';
  card.append(progress, title, description, next);
  overlay.append(shield, spotlight, card);

  const targetFor = step => typeof step.target === 'string'
    ? document.querySelector(step.target)
    : step.target;

  const position = () => {
    frame = 0;
    const target = targetFor(steps[index]);
    const rect = target?.getBoundingClientRect?.();
    const visible = target?.isConnected !== false && rect?.width > 0 && rect?.height > 0;
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const measured = card.getBoundingClientRect();
    const cardRect = {
      width: measured.width || Math.min(340, viewport.width - 32),
      height: measured.height || 180,
    };

    if (visible) {
      const pad = 7;
      const focusRect = {
        left: clamp(rect.left - pad, 0, viewport.width),
        top: clamp(rect.top - pad, 0, viewport.height),
        right: clamp(rect.right + pad, 0, viewport.width),
        bottom: clamp(rect.bottom + pad, 0, viewport.height),
      };
      focusRect.width = focusRect.right - focusRect.left;
      focusRect.height = focusRect.bottom - focusRect.top;
      Object.assign(spotlight.style, {
        display: 'block',
        left: `${focusRect.left}px`,
        top: `${focusRect.top}px`,
        width: `${focusRect.width}px`,
        height: `${focusRect.height}px`,
      });
      const fillsViewport = rect.width >= viewport.width * 0.9 && rect.height >= viewport.height * 0.9;
      shield.style.background = fillsViewport ? 'rgba(0, 0, 0, 0.58)' : 'transparent';
      const placed = computeTourCardPosition(focusRect, cardRect, viewport);
      card.dataset.placement = placed.placement;
      card.style.left = `${placed.left}px`;
      card.style.top = `${placed.top}px`;
    } else {
      spotlight.style.display = 'none';
      shield.style.background = 'rgba(0, 0, 0, 0.74)';
      card.dataset.placement = 'center';
      card.style.left = `${(viewport.width - cardRect.width) / 2}px`;
      card.style.top = `${(viewport.height - cardRect.height) / 2}px`;
    }
  };

  const schedulePosition = () => {
    if (frame) window.cancelAnimationFrame(frame);
    frame = window.requestAnimationFrame(position);
  };

  const showStep = () => {
    const step = steps[index];
    progress.textContent = `Step ${index + 1} of ${steps.length}`;
    title.textContent = step.title;
    description.textContent = step.description;
    next.textContent = index === steps.length - 1 ? 'Start Exploring' : 'Next';
    schedulePosition();
  };

  const blockKeys = event => {
    if (event.key === 'Tab') {
      event.preventDefault();
      next.focus();
      return;
    }
    if (event.target === next && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!event.repeat) next.click();
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  const finish = completed => {
    if (ended) return;
    ended = true;
    if (completed) markOnboardingComplete(storageKey, storage);
    if (frame) window.cancelAnimationFrame(frame);
    window.removeEventListener('resize', schedulePosition);
    document.removeEventListener('keydown', blockKeys, true);
    overlay.remove();
    appRoot.inert = previousInert;
    if (previousFocus?.isConnected) previousFocus.focus();
    onEnd({ completed });
  };

  next.addEventListener('click', () => {
    if (index < steps.length - 1) {
      index++;
      showStep();
    } else {
      finish(true);
    }
  });

  onStart();
  appRoot.inert = true;
  document.body.append(overlay);
  window.addEventListener('resize', schedulePosition);
  document.addEventListener('keydown', blockKeys, true);
  showStep();
  next.focus();

  return { destroy: () => finish(false) };
}
