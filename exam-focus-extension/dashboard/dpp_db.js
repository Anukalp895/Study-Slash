/**
 * DPP Storage - IndexedDB Manager for DPP PDFs
 * Persists large PDF binary data and session cache without hitting chrome.storage.local 10MB quota
 */
(() => {
  'use strict';

  const DB_NAME = 'ExamArenaDPP';
  const DB_VERSION = 1;
  const STORE_NAME = 'pdf_documents';

  let dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'sessionId' });
        }
      };
      request.onsuccess = (event) => resolve(event.target.result);
      request.onerror = (event) => reject(event.target.error);
    });
    return dbPromise;
  }

  /**
   * Save PDF as a Blob into IndexedDB.
   * Blobs cannot be detached and are immune to ArrayBuffer detachment errors.
   */
  async function savePdfBlob(sessionId, data, extraMetadata = {}) {
    const db = await openDB();
    const existing = await getPdfSession(sessionId).catch(() => null);

    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);

        const payload = (typeof Blob !== 'undefined' && data instanceof Blob)
          ? data
          : new Blob([data], { type: 'application/pdf' });

        const item = {
          sessionId,
          fileName: extraMetadata.fileName || existing?.fileName || 'dpp.pdf',
          pdfBlob: payload,
          pdfBuffer: null, // Avoid detached buffer issues; converted on retrieval if needed
          totalPages: extraMetadata.totalPages || existing?.totalPages || 0,
          metadata: extraMetadata.metadata || existing?.metadata || {},
          answerKey: extraMetadata.answerKey || existing?.answerKey || {},
          solutionPages: extraMetadata.solutionPages || existing?.solutionPages || {},
          createdAt: existing?.createdAt || Date.now(),
          savedAt: Date.now()
        };

        const request = store.put(item);
        request.onsuccess = () => resolve(true);
        request.onerror = (e) => reject(request.error || e.target?.error || e);
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Save a PDF session record. Handles ArrayBuffer, Uint8Array, or Blob cleanly.
   */
  async function savePdfSession(sessionId, record) {
    const db = await openDB();
    let bufferToStore = record.pdfBuffer;
    let blobToStore = record.pdfBlob || null;

    // Guard against detached buffers and create Blob backup
    if (bufferToStore) {
      try {
        if (typeof Blob !== 'undefined' && bufferToStore instanceof Blob) {
          blobToStore = bufferToStore;
          bufferToStore = null;
        } else if (bufferToStore instanceof Uint8Array) {
          if (bufferToStore.byteLength > 0) {
            blobToStore = new Blob([bufferToStore], { type: 'application/pdf' });
            bufferToStore = bufferToStore.buffer.slice(bufferToStore.byteOffset, bufferToStore.byteOffset + bufferToStore.byteLength);
          } else {
            bufferToStore = null;
          }
        } else if (bufferToStore instanceof ArrayBuffer) {
          if (bufferToStore.byteLength > 0 && !bufferToStore.detached) {
            blobToStore = new Blob([bufferToStore], { type: 'application/pdf' });
            bufferToStore = bufferToStore.slice(0);
          } else {
            bufferToStore = null;
          }
        }
      } catch (e) {
        console.warn('Buffer processing error in savePdfSession, falling back:', e);
        bufferToStore = null;
      }
    }

    // If buffer/blob was detached or omitted, check if existing record has a valid buffer or blob
    if (!bufferToStore && !blobToStore) {
      const existing = await getPdfSession(sessionId).catch(() => null);
      if (existing?.pdfBlob) {
        blobToStore = existing.pdfBlob;
      }
      if (existing?.pdfBuffer && existing.pdfBuffer.byteLength > 0 && !existing.pdfBuffer.detached) {
        bufferToStore = existing.pdfBuffer;
      }
    }

    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const item = {
          sessionId,
          fileName: record.fileName || 'dpp.pdf',
          pdfBuffer: bufferToStore, // Non-detached ArrayBuffer or null
          pdfBlob: blobToStore,     // Safe Blob payload
          totalPages: record.totalPages || 0,
          metadata: record.metadata || {},
          answerKey: record.answerKey || {},
          solutionPages: record.solutionPages || {},
          createdAt: record.createdAt || Date.now()
        };
        const req = store.put(item);
        req.onsuccess = () => resolve(true);
        req.onerror = (e) => reject(req.error || e.target?.error || e);
      } catch (err) {
        reject(err);
      }
    });
  }

  async function getPdfSession(sessionId) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(sessionId);
        req.onsuccess = async () => {
          const res = req.result;
          if (!res) {
            resolve(null);
            return;
          }
          // If pdfBuffer is missing or detached, but pdfBlob exists, reconstruct fresh pdfBuffer from pdfBlob
          const isDetached = res.pdfBuffer && (res.pdfBuffer.detached || res.pdfBuffer.byteLength === 0);
          if ((!res.pdfBuffer || isDetached) && res.pdfBlob && typeof res.pdfBlob.arrayBuffer === 'function') {
            try {
              res.pdfBuffer = await res.pdfBlob.arrayBuffer();
            } catch (err) {
              console.warn('Failed to convert stored pdfBlob to arrayBuffer:', err);
            }
          }
          resolve(res);
        };
        req.onerror = (e) => reject(req.error || e.target?.error || e);
      } catch (err) {
        reject(err);
      }
    });
  }

  async function deletePdfSession(sessionId) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(sessionId);
        req.onsuccess = () => resolve(true);
        req.onerror = (e) => reject(req.error || e.target?.error || e);
      } catch (err) {
        reject(err);
      }
    });
  }

  async function clearAllPdfSessions() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.clear();
        req.onsuccess = () => resolve(true);
        req.onerror = (e) => reject(req.error || e.target?.error || e);
      } catch (err) {
        reject(err);
      }
    });
  }

  const DPPStorage = {
    savePdfSession,
    savePdfBlob,
    getPdfSession,
    deletePdfSession,
    clearAllPdfSessions
  };

  if (typeof window !== 'undefined') {
    window.DPPStorage = DPPStorage;
    window.savePdfBlob = savePdfBlob;
    window.getPdfSession = getPdfSession;
    window.savePdfSession = savePdfSession;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = DPPStorage;
    module.exports.savePdfBlob = savePdfBlob;
    module.exports.savePdfSession = savePdfSession;
    module.exports.getPdfSession = getPdfSession;
  }
})();
