"use strict";

// cfg-AdBlocker Shared Utilities

/**
 * Converts a wildcard pattern (e.g., "*://*.example.com/*") to a RegExp.
 * @param {string} pattern 
 * @returns {RegExp}
 */
function wildcardToRegExp(pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp("^" + escaped.replace(/\*/g, ".*") + "$");
}

/**
 * Checks if a URL matches a given pattern.
 * Supports patterns like "*://*.example.com/*".
 * @param {string} url 
 * @param {string} pattern 
 * @returns {boolean}
 */
function urlMatches(url, pattern) {
  try {
    const patterns = pattern.includes("://*.") || pattern.includes("://*.")
      ? [pattern, pattern.replace("://*.", "://").replace("://*.", "://").replace("://*.", "://")] 
      : [pattern];
    for (const p of patterns) {
      if (wildcardToRegExp(p).test(url)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Generates a random ID (hex string).
 * @param {number} length Byte length (default 8 -> 16 chars)
 * @returns {string}
 */
function cryptoRandomId(length = 8) {
  const arr = new Uint8Array(length);
  self.crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Escapes HTML special characters.
 * @param {string} s 
 * @returns {string}
 */
function escapeHtml(s) {
  return (s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]));
}

/**
 * Escapes double quotes for attribute values.
 * @param {string} s 
 * @returns {string}
 */
function escapeAttr(s) {
  return (s || "").replace(/"/g, '&quot;');
}

/**
 * Escapes less-than sign to prevent script injection in textareas.
 * @param {string} s 
 * @returns {string}
 */
function escapeText(s) {
  return (s || "").replace(/</g, '&lt;');
}

/**
 * Calculates SHA-256 hash of a string and returns it as a hex string.
 * @param {string} text 
 * @returns {Promise<string>}
 */
async function sha256base16(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  const arr = Array.from(new Uint8Array(buf));
  return arr.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Escapes characters for CSS selectors.
 * @param {string} str 
 * @returns {string}
 */
function cssEscape(str) {
  return str.replace(/[^a-zA-Z0-9_-]/g, (m) => `\\${m}`);
}

// Export for Service Worker (importScripts)
if (typeof self !== 'undefined') {
  self.wildcardToRegExp = wildcardToRegExp;
  self.urlMatches = urlMatches;
  self.cryptoRandomId = cryptoRandomId;
  self.escapeHtml = escapeHtml;
  self.escapeAttr = escapeAttr;
  self.escapeText = escapeText;
  self.sha256base16 = sha256base16;
  self.cssEscape = cssEscape;
}
