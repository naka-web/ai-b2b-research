import type { OverseasCompany } from './types';
const STORE = 'companies';
function open() { return new Promise<IDBDatabase>((resolve, reject) => {
  const req = indexedDB.open('overseas-matcha-mvp', 1);
  req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
  req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
}); }
export async function loadCompanies(): Promise<OverseasCompany[]> {
  const db = await open(); return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly'); const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); tx.oncomplete = () => db.close();
  });
}
export async function saveCompany(company: OverseasCompany) {
  const db = await open(); return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(company);
    tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => { db.close(); reject(tx.error); }; tx.onabort = () => { db.close(); reject(tx.error); };
  });
}
