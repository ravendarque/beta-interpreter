/** @typedef {Record<string, string | number | boolean | undefined>} Attrs */

/** @param {string} tag @param {Attrs} [attrs] @param {(Node | string)[]} [kids] */
export function h(tag, attrs = {}, kids = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === "text") el.textContent = String(v);
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  el.append(...kids);
  return el;
}

const NS = "http://www.w3.org/2000/svg";

/** @param {string} tag @param {Attrs} [attrs] @param {(Node | string)[]} [kids] */
export function s(tag, attrs = {}, kids = []) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === "text") el.textContent = String(v);
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  el.append(...kids);
  return el;
}

/** @param {string} id */
export const $ = id => /** @type {HTMLElement} */ (document.getElementById(id));
