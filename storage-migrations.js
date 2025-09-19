"use strict";

// Basit storage migrasyon altyapısı
// Gelecekte şema değişikliklerini burada dönüştürün

async function migrateStorageIfNeeded() {
  try {
    const STORAGE_KEY = "cfgState";
    const { [STORAGE_KEY]: cfgState } = await chrome.storage.local.get(STORAGE_KEY);
    if (!cfgState) return; // onInstalled henüz varsayılanı yazmamış olabilir

    const currentVersion = typeof cfgState.version === "number" ? cfgState.version : 0;
    let state = { ...cfgState };

    // Örnek migrasyon kalıbı:
    // if (currentVersion === 1) {
    //   state.version = 2;
    //   state.rules = Array.isArray(state.rules) ? state.rules : [];
    // }

    if (state.version !== currentVersion) {
      await chrome.storage.local.set({ [STORAGE_KEY]: state });
      console.info("[cfg-AdBlocker] Storage migrated to version", state.version);
    }
  } catch (err) {
    console.error("[cfg-AdBlocker] migrateStorageIfNeeded error", err);
  }
}

// Export
self.migrateStorageIfNeeded = migrateStorageIfNeeded;
