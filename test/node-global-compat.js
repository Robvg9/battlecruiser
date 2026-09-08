"use strict";

// Node 21+ exposes navigator/crypto on globalThis through read-only accessors.
// Legacy jsdom tests assign those globals for browser emulation, so remove the
// configurable accessors before the test starts. This file is test-only and
// never loaded by production code.
for (const key of ["navigator", "crypto"]) {
  try {
    if (Object.prototype.hasOwnProperty.call(globalThis, key)) {
      delete globalThis[key];
    }
  } catch (_) {}
}
