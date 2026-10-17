// Original cockpit pictograms. Shared geometry keeps the HUD legible at small sizes.
const svg = (body, viewBox = '0 0 64 40') => `<svg viewBox="${viewBox}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true" focusable="false">${body}</svg>`;

export const shieldIcon = svg('<path d="M16 3 27 7v9c0 7-5 12-11 15C10 28 5 23 5 16V7Z"/><path d="m16 7 7 3v6c0 5-3 9-7 11Z" fill="currentColor" stroke="none"/>', '0 0 32 34');
export const hullIcon = svg('<path d="m16 3 11 5-2 15-9 8-9-8L5 8Z" fill="currentColor" fill-opacity=".18"/><path d="m16 9 4 7-4 9-4-9Z" fill="currentColor" stroke="none"/>', '0 0 32 34');
export const chevronIcon = (direction) => svg(`<path d="${direction === 'left' ? 'm20 7-8 9 8 9' : 'm12 7 8 9-8 9'}"/>`, '0 0 32 32');

const weaponIcons = {
  laser: svg('<path d="M7 13h25v5H7zM7 23h25v5H7zM32 12h12l4 5-4 5H32M32 23h12l4 5-4 5H32M48 17h10M48 28h10M4 10v21"/><path d="M12 15.5h13M12 25.5h13M53 12v3M53 30v3"/>'),
  'linked-laser': svg('<path d="M6 8h31v5H6zM6 17h31v5H6zM6 26h31v5H6zM37 7h8l5 5-5 6h-8M37 22h8l5 5-5 6h-8M50 12h9M50 27h9M3 5v29"/>'),
  'ion-cannon': svg('<path d="M5 15h17v10H5zM5 19h-3M22 12h8M22 28h8M47 12h11M47 28h11"/><circle cx="38" cy="20" r="12"/><path d="m39 10-8 11h7l-2 10 10-13h-8Z" fill="currentColor" stroke="none"/>'),
  'proton-torpedo': svg('<path d="m7 20 12-7h28l12 7-12 7H19Z"/><path d="m22 13-8-7h12l9 7M22 27l-8 7h12l9-7M45 14v12M50 17v6M10 17H4M10 23H4"/><path d="M24 17h14v6H24Z" fill="currentColor" stroke="none"/>'),
};

export function weaponIcon(id) {
  return weaponIcons[id] || weaponIcons.laser;
}
