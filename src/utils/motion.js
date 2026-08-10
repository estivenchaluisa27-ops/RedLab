/**
 * src/utils/motion.js — Micro-interacciones GSAP (entrada de vistas, modales, listas)
 * Degrada a no-op si GSAP no está disponible: la app funciona sin animación.
 */

const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
const hasGsap = typeof window.gsap !== 'undefined';
const gsap = window.gsap;

/**
 * Animación de entrada de un elemento (fade + rise).
 * @param {HTMLElement|string} target
 */
export function animateViewIn(target) {
  if (!hasGsap || prefersReduced.matches) return;
  const el = typeof target === 'string' ? document.getElementById(target) : target;
  if (!el || el.classList.contains('hidden')) return;
  gsap.fromTo(el,
    { autoAlpha: 0, y: 16 },
    { autoAlpha: 1, y: 0, duration: 0.45, ease: 'power3.out', overwrite: 'auto' }
  );
}

/**
 * Animación de entrada del panel de un modal (scale-in).
 * @param {HTMLElement} modal - el backdrop del modal (padre del panel)
 */
export function animateModalIn(modal) {
  if (!hasGsap || prefersReduced.matches) return;
  const panel = modal.querySelector(':scope > div');
  if (!panel) return;
  gsap.fromTo(panel,
    { autoAlpha: 0, scale: 0.92, y: 10 },
    { autoAlpha: 1, scale: 1, y: 0, duration: 0.35, ease: 'power3.out', overwrite: 'auto' }
  );
}

/**
 * Stagger de entrada de los hijos de un contenedor (una sola vez por carga).
 * @param {HTMLElement|string} target
 */
export function animateListIn(target) {
  if (!hasGsap || prefersReduced.matches) return;
  const container = typeof target === 'string' ? document.getElementById(target) : target;
  if (!container || !container.children.length) return;
  gsap.fromTo(container.children,
    { autoAlpha: 0, y: 10 },
    { autoAlpha: 1, y: 0, duration: 0.35, ease: 'power2.out', stagger: 0.03, overwrite: 'auto' }
  );
}

/**
 * Feedback de presión sutil en botones con data-action (press effect).
 * @param {PointerEvent} e
 */
export function handlePress(e) {
  if (!hasGsap || prefersReduced.matches) return;
  const btn = e.target.closest('button');
  if (!btn) return;
  gsap.to(btn, { scale: 0.97, duration: 0.1, ease: 'power1.out', overwrite: 'auto' });
}

/**
 * Registra un MutationObserver que anima la entrada de cualquier modal
 * que pierda la clase 'hidden' (cubre opens existentes y futuros).
 */
export function initMotionObserver() {
  if (!hasGsap) return;
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((m) => {
      const node = m.target;
      if (!(node instanceof HTMLElement)) return;
      if (!node.classList.contains('modal-backdrop')) return;
      const wasHidden = m.oldValue && m.oldValue.includes('hidden');
      if (wasHidden && !node.classList.contains('hidden')) animateModalIn(node);
    });
  });
  observer.observe(document.body, {
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
    attributeOldValue: true,
  });
}
