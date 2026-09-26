// Inline SVG icons (24×24, stroked with currentColor) for the UI chrome.

const P = {
  play: '<path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" fill="currentColor" stroke="none"/>',
  pause: '<rect x="6.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" stroke="none"/><rect x="13.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" stroke="none"/>',
  replay: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4.5h4.5"/>',
  restart: '<path d="M6 5v14"/><path d="M19 5.8v12.4a.8.8 0 0 1-1.25.66L9.5 13.3a1.6 1.6 0 0 1 0-2.6l8.25-5.56A.8.8 0 0 1 19 5.8Z" fill="currentColor" stroke="none"/>',
  stepBack: '<path d="M18 6.2v11.6a.8.8 0 0 1-1.25.66L8.6 12.66a.8.8 0 0 1 0-1.32l8.15-5.8A.8.8 0 0 1 18 6.2Z" fill="currentColor" stroke="none"/><path d="M6.5 6v12"/>',
  stepFwd: '<path d="M6 6.2v11.6a.8.8 0 0 0 1.25.66l8.15-5.8a.8.8 0 0 0 0-1.32L7.25 5.54A.8.8 0 0 0 6 6.2Z" fill="currentColor" stroke="none"/><path d="M17.5 6v12"/>',
  sliders: '<path d="M4 7h9"/><path d="M17 7h3"/><circle cx="15" cy="7" r="2"/><path d="M4 17h3"/><path d="M11 17h9"/><circle cx="9" cy="17" r="2"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  close: '<path d="M6 6l12 12"/><path d="M18 6 6 18"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  fit: '<path d="M4 9V5a1 1 0 0 1 1-1h4"/><path d="M15 4h4a1 1 0 0 1 1 1v4"/><path d="M20 15v4a1 1 0 0 1-1 1h-4"/><path d="M9 20H5a1 1 0 0 1-1-1v-4"/><circle cx="12" cy="12" r="3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 7.5v.01"/>',
  legend: '<circle cx="8" cy="8" r="3.2"/><circle cx="8" cy="8" r="5.2" opacity=".45"/><path d="M15 7h5"/><path d="M4 17h2"/><path d="M10 17h10"/>',
  pin: '<path d="M9 4h6l-1 5 3 3v2H7v-2l3-3Z"/><path d="M12 14v6"/>',
  reset: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4.5h4.5"/>',
  arrowRight: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
  arrowLeft: '<path d="M19 12H5"/><path d="m11 6-6 6 6 6"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  alert: '<path d="M12 4 2.8 19.5h18.4Z"/><path d="M12 10v4.5"/><path d="M12 17.2v.01"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  keyboard: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10"/>',
};

export function icon(name, cls = '') {
  const span = document.createElement('span');
  span.className = `ic ${cls}`.trim();
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${P[name] ?? ''}</svg>`;
  return span;
}

export function iconSVG(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] ?? ''}</svg>`;
}

/** The brand rain drop (same path as the paper's eyebrow). */
export function dropMark(cls = 'drop') {
  const span = document.createElement('span');
  span.className = cls;
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = '<svg viewBox="0 0 14 18"><path d="M7 0C7 0 0 8.2 0 11.5A7 7 0 0 0 14 11.5C14 8.2 7 0 7 0Z" fill="currentColor"/></svg>';
  return span;
}
