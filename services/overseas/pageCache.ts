import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, readdir, stat, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
export type CachedPage = { at: number; body: string; type: string; status: number; location?: string };
const directory = join(tmpdir(), `matcha-research-${createHash('sha256').update(process.cwd()).digest('hex').slice(0, 16)}`);
const pathFor = (url: string) => join(directory, `${createHash('sha256').update(url).digest('hex')}.json`);
export async function readPageCache(url: string): Promise<CachedPage | null> {
  try { const value = JSON.parse(await readFile(pathFor(url), 'utf8')); return typeof value.at === 'number' && typeof value.body === 'string' ? value : null; } catch { return null; }
}
export async function writePageCache(url: string, value: CachedPage) {
  try {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const path = pathFor(url); await writeFile(`${path}.tmp`, JSON.stringify(value), { mode: 0o600 }); await rename(`${path}.tmp`, path);
    const files = (await readdir(directory)).filter(f => f.endsWith('.json'));
    if (files.length > 120) {
      const dated = await Promise.all(files.map(async f => ({ path: join(directory, f), time: (await stat(join(directory, f))).mtimeMs })));
      await Promise.all(dated.sort((a, b) => a.time - b.time).slice(0, files.length - 120).map(f => unlink(f.path)));
    }
  } catch { /* Cache is optional; research results are persisted separately in IndexedDB. */ }
}
