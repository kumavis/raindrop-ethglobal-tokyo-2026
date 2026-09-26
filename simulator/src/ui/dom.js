// Tiny DOM helpers for the UI chrome: element creation plus change-only setters, so
// the per-frame update() touches the DOM only when a displayed value actually changed.

/** h('div.panel.card', { onclick, title, style, dataset }, ...children) */
export function h(spec, attrs = {}, ...children) {
  const [tag, ...classes] = spec.split('.');
  const el = document.createElement(tag || 'div');
  if (classes.length) el.className = classes.join(' ');
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style') for (const [sk, sv] of Object.entries(v)) el.style.setProperty(sk.startsWith('--') ? sk : sk.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()), sv);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

/** Replaces all children. */
export function fill(el, ...children) {
  el.replaceChildren();
  append(el, children);
  return el;
}

const last = new WeakMap();
const cached = (el, key, v) => {
  let m = last.get(el);
  if (!m) last.set(el, (m = {}));
  if (m[key] === v) return false;
  m[key] = v;
  return true;
};

export function setText(el, v) {
  if (cached(el, 'text', v)) el.textContent = v;
}

export function setHTML(el, v) {
  if (cached(el, 'html', v)) el.innerHTML = v;
}

export function setClass(el, name, on) {
  if (cached(el, 'c:' + name, !!on)) el.classList.toggle(name, !!on);
}

export function setStyle(el, prop, v) {
  if (cached(el, 's:' + prop, v)) el.style.setProperty(prop, v);
}

export function setAttr(el, name, v) {
  if (!cached(el, 'a:' + name, v)) return;
  if (v === null || v === false || v === undefined) el.removeAttribute(name);
  else el.setAttribute(name, v === true ? '' : v);
}

export function debounce(fn, ms) {
  let t;
  const d = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  d.flush = (...args) => {
    clearTimeout(t);
    fn(...args);
  };
  return d;
}

/** True while focus is in a text-like input, so global shortcuts stay out of the way. */
export function isTyping(target) {
  const el = target ?? document.activeElement;
  if (!el) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
  return el.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'button'].includes(el.type);
}
