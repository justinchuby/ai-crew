import { useEffect } from 'react';

/**
 * Global hook: converts all native `title` attributes into glass-style tooltips.
 * Attach once in App. Works by intercepting mouseenter/mouseleave on any element with [title].
 */
export function useGlassTooltips() {
  useEffect(() => {
    let tip: HTMLDivElement | null = null;
    let showTimer: ReturnType<typeof setTimeout>;
    let current: HTMLElement | null = null;
    const DELAY = 400;

    function createTip() {
      const el = document.createElement('div');
      el.className = 'glass-tooltip';
      el.style.position = 'fixed';
      el.style.zIndex = '9999';
      el.style.pointerEvents = 'none';
      el.style.opacity = '0';
      el.style.transition = 'opacity 0.15s ease';
      const inner = document.createElement('div');
      inner.className = 'glass-tooltip-inner';
      el.appendChild(inner);
      document.body.appendChild(el);
      return el;
    }

    function show(target: HTMLElement) {
      const text = target.getAttribute('data-glass-title');
      if (!text) return;
      if (!tip) tip = createTip();
      const inner = tip.firstElementChild as HTMLDivElement;
      inner.textContent = text;
      tip.style.opacity = '0';
      tip.style.display = 'block';

      // Position above target
      const rect = target.getBoundingClientRect();
      const pad = 8;
      tip.style.left = `${rect.left + rect.width / 2}px`;
      tip.style.top = `${rect.top - pad}px`;
      tip.style.transform = 'translate(-50%, -100%)';

      // Clamp to viewport after layout
      requestAnimationFrame(() => {
        if (!tip) return;
        const tr = tip.getBoundingClientRect();
        const vw = window.innerWidth;
        let left = parseFloat(tip.style.left);

        // Flip below if too close to top
        if (tr.top < 8) {
          tip.style.top = `${rect.bottom + pad}px`;
          tip.style.transform = 'translate(-50%, 0)';
        }
        // Clamp horizontal
        if (tr.right > vw - 8) {
          left -= tr.right - (vw - 8);
          tip.style.left = `${left}px`;
        }
        if (tr.left < 8) {
          left += 8 - tr.left;
          tip.style.left = `${left}px`;
        }
        tip.style.opacity = '1';
      });
    }

    function hide() {
      clearTimeout(showTimer);
      current = null;
      if (tip) {
        tip.style.opacity = '0';
        tip.style.display = 'none';
      }
    }

    function onEnter(e: MouseEvent) {
      const target = (e.target as HTMLElement).closest('[title]') as HTMLElement | null;
      if (!target) return;

      // Steal the title to prevent native tooltip
      const text = target.getAttribute('title');
      if (text) {
        target.setAttribute('data-glass-title', text);
        target.removeAttribute('title');
      }

      const stored = target.getAttribute('data-glass-title');
      if (!stored) return;

      current = target;
      clearTimeout(showTimer);
      showTimer = setTimeout(() => {
        if (current === target) show(target);
      }, DELAY);
    }

    function onLeave(e: MouseEvent) {
      const target = (e.target as HTMLElement).closest('[data-glass-title]') as HTMLElement | null;
      if (!target) return;
      // Restore title so it works if JS is somehow disabled or for accessibility
      const text = target.getAttribute('data-glass-title');
      if (text) target.setAttribute('title', text);
      target.removeAttribute('data-glass-title');
      hide();
    }

    document.addEventListener('mouseenter', onEnter, true);
    document.addEventListener('mouseleave', onLeave, true);
    document.addEventListener('scroll', hide, true);

    return () => {
      document.removeEventListener('mouseenter', onEnter, true);
      document.removeEventListener('mouseleave', onLeave, true);
      document.removeEventListener('scroll', hide, true);
      clearTimeout(showTimer);
      if (tip) { tip.remove(); tip = null; }
    };
  }, []);
}
