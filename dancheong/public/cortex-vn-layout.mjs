// The top-level document owns the phone's safe area and visual viewport.
// An embedded document can report zero insets even on a notched iPhone.
export function createVNLayout(view = window) {
  let dispose = null;
  return {
    start() {
      if (dispose) return;
      const doc = view.document, root = doc.documentElement;
      const outer = view.parent, frame = view.frameElement;
      const surface = frame?.closest('.cortex-reader-native,.cortex-multiplayer-reader');
      if (!surface) return;
      const probe = outer.document.createElement('div');
      probe.setAttribute('aria-hidden', 'true');
      probe.dataset.vnSafeArea = '';
      probe.style.cssText = 'position:fixed;inset:0;visibility:hidden;pointer-events:none;box-sizing:border-box;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
      outer.document.body.append(probe);
      const viewport = outer.visualViewport;
      let raf = 0;
      const props = ['top','right','bottom','left'];
      const update = () => {
        raf = 0;
        // Pinch zoom belongs to the browser, not the game's camera/layout.
        if (viewport && Math.abs(viewport.scale - 1) > .01) return;
        const fullscreen = !!doc.fullscreenElement;
        const height = viewport?.height || outer.innerHeight;
        const offset = viewport?.offsetTop || 0;
        const keyboard = outer.innerHeight - height > 120;
        root.dataset.vnKeyboardOpen = String(keyboard);
        surface.style.setProperty('--vn-viewport-height', `${height}px`);
        surface.style.setProperty('--vn-viewport-top', `${offset}px`);
        const css = outer.getComputedStyle(probe);
        for (const edge of props) {
          let value = parseFloat(css.getPropertyValue('padding-' + edge)) || 0;
          if (fullscreen || (edge === 'bottom' && keyboard)) value = 0;
          if (edge === 'top') value = Math.max(0, value - offset);
          root.style.setProperty('--vn-safe-' + edge, `${value}px`);
        }
        for (const [name, selector] of [
          ['controls','.vn-reading-controls'],
          ['voice','.vn-voice-controls'],
          ['status','.vn-visual-status'],
        ]) {
          const element = doc.querySelector(selector);
          const height = element?.getBoundingClientRect().height || 0;
          root.style.setProperty('--vn-' + name + '-height', `${Math.ceil(height)}px`);
        }
      };
      const schedule = () => { if (!raf) raf = view.requestAnimationFrame(update); };
      const events = [[outer,'resize'],[outer,'orientationchange'],[outer,'pageshow'],[doc,'fullscreenchange'],[viewport,'resize'],[viewport,'scroll']];
      for (const [target, name] of events) target?.addEventListener(name, schedule);
      const observer = view.ResizeObserver ? new view.ResizeObserver(schedule) : null;
      for (const selector of ['.vn-reading-controls','.vn-voice-controls','.vn-visual-status']) {
        const element = doc.querySelector(selector); if (element) observer?.observe(element);
      }
      update();
      dispose = () => {
        if (raf) view.cancelAnimationFrame(raf);
        for (const [target, name] of events) target?.removeEventListener(name, schedule);
        observer?.disconnect(); probe.remove();
        delete root.dataset.vnKeyboardOpen;
        for (const edge of props) root.style.removeProperty('--vn-safe-' + edge);
        for (const name of ['controls','voice','status']) root.style.removeProperty('--vn-' + name + '-height');
        surface.style.removeProperty('--vn-viewport-height');
        surface.style.removeProperty('--vn-viewport-top');
      };
    },
    stop() { dispose?.(); dispose = null; },
  };
}
