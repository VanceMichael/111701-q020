export class RecordStore {
  #records = new Map();

  save(record) {
    const key = `${record.source}:${record.id}`;
    const previous = this.#records.get(key);
    if (!previous || record.revision >= previous.revision) {
      this.#records.set(key, structuredClone(record));
    }
    return structuredClone(this.#records.get(key));
  }

  list() {
    return [...this.#records.values()].map((record) => structuredClone(record));
  }
}
