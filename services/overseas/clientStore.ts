import type { OverseasCompany } from './types';
import type { TradeScreeningRecord } from './candidates/types';
const STORE = 'companies';
const SCREENING_STORE = 'tradeScreenings';
function open() { return new Promise<IDBDatabase>((resolve, reject) => {
  const req = indexedDB.open('overseas-matcha-mvp', 2);
  req.onupgradeneeded = () => {
    if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
    if (!req.result.objectStoreNames.contains(SCREENING_STORE)) req.result.createObjectStore(SCREENING_STORE, { keyPath: 'candidateId' });
  };
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
export async function loadTradeScreenings(): Promise<TradeScreeningRecord[]> {
  const db = await open(); return new Promise((resolve, reject) => {
    const tx = db.transaction(SCREENING_STORE, 'readonly'); const req = tx.objectStore(SCREENING_STORE).getAll();
    req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); tx.oncomplete = () => db.close();
  });
}
export async function saveTradeScreening(record: TradeScreeningRecord) {
  const db = await open(); return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SCREENING_STORE, 'readwrite'); tx.objectStore(SCREENING_STORE).put(record);
    tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => { db.close(); reject(tx.error); }; tx.onabort = () => { db.close(); reject(tx.error); };
  });
}
