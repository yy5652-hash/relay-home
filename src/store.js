import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fixture } from './planner.js';

export class Store {
  constructor(path) {
    this.path = path;
    try { this.state = JSON.parse(readFileSync(path, 'utf8')); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      this.state = fixture();
      this.persist(this.state);
    }
  }
  persist(state) {
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
    writeFileSync(`${this.path}.tmp`, JSON.stringify(state, null, 2), { mode: 0o600 });
    renameSync(`${this.path}.tmp`, this.path);
  }
  read() { return structuredClone(this.state); }
  update(operation) {
    const next = this.read();
    const result = operation(next);
    this.persist(next);
    this.state = next;
    return structuredClone(result);
  }
}
