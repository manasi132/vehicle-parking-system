
import '@testing-library/jest-dom/vitest';
import { beforeEach } from 'vitest';

// Provide consistent browser-style storage in the jsdom test environment.
function createMemoryStorage() {
  const store = new Map();

  return {
    get length() {
      return store.size;
    },

    clear() {
      store.clear();
    },

    getItem(key) {
      return store.has(String(key))
        ? store.get(String(key))
        : null;
    },

    key(index) {
      return Array.from(store.keys())[index] ?? null;
    },

    removeItem(key) {
      store.delete(String(key));
    },

    setItem(key, value) {
      store.set(String(key), String(value));
    },
  };
}

const testStorage = createMemoryStorage();

Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: testStorage,
});

// Start each test with an empty storage area.
beforeEach(() => {
  window.localStorage.clear();
});
