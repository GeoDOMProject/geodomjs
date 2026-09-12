import { mount } from './interactive-runtime.js';
import { runtimeCss } from './runtime-assets.js';

/** Browser component with isolated styles. Data enters the DOM as text only. */
export function mountInteractiveViewer(container, payload) {
  const target = typeof container === 'string' ? document.querySelector(container) : container;
  if (!target) throw new Error('No se encontró el contenedor del mapa.');
  const element = document.createElement('div');
  element.style.cssText = 'display:block;width:100%;height:840px;min-height:640px';
  const shadow = element.attachShadow({mode:'open'});
  const style = document.createElement('style');
  style.textContent = runtimeCss;
  const root = document.createElement('div');
  root.style.cssText = 'font-family:system-ui,sans-serif;color:#18352d;background:white';
  shadow.append(style, root);
  target.replaceChildren(element);
  const controller = mount(root, payload);
  return { element, destroy() { controller.destroy(); element.remove(); } };
}
