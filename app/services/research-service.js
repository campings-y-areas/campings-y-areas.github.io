export function createResearchService({ request }) {
  if (typeof request !== "function") throw new TypeError("Cliente de investigación no configurado");
  const memory = new Map();

  return Object.freeze({
    async get(key, payload) {
      if (memory.has(key)) return memory.get(key);
      const value = await request(payload);
      memory.set(key, value);
      return value;
    },
    clear(key) {
      if (key) memory.delete(key); else memory.clear();
    }
  });
}
