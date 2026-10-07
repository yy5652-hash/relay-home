// One JSON file per household. Writes go to a temporary file first, so a crash never leaves half a household behind.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { newHousehold } from './household.js';

export class Homes {
  constructor(dir) {
    this.dir = dir;
    this.cache = new Map();
    mkdirSync(dir, { recursive: true });
  }

  file(id) {
    if (!/^[a-z0-9-]{6,64}$/.test(id)) throw new Error('Invalid household id.');
    return join(this.dir, `${id}.json`);
  }

  read(id) {
    if (!this.cache.has(id)) {
      let home;
      try { home = JSON.parse(readFileSync(this.file(id), 'utf8')); } catch { home = newHousehold(); }
      this.cache.set(id, home);
    }
    return this.cache.get(id);
  }

  // `change` works on a copy; the household is replaced only if it returns without throwing.
  update(id, change) {
    const draft = structuredClone(this.read(id));
    const result = change(draft);
    const file = this.file(id);
    writeFileSync(`${file}.tmp`, JSON.stringify(draft));
    renameSync(`${file}.tmp`, file);
    this.cache.set(id, draft);
    return result;
  }

  reset(id) {
    return this.update(id, home => { Object.keys(home).forEach(key => delete home[key]); Object.assign(home, newHousehold()); return home; });
  }
}
