// Registro único de fuentes de Campings & Áreas.
// Las pantallas y Rutas consultan esta capa; no vuelven a mantener cargadores incompatibles.

const registry = new Map();
const cache = new Map();
const pending = new Map();

export function registerDataset(key, descriptor) {
  if (!key || !descriptor?.url) throw new TypeError("Dataset inválido");
  registry.set(key, Object.freeze({ ...descriptor }));
}

export function getDatasetDescriptor(key) {
  return registry.get(key) ?? null;
}

export async function loadDataset(key, { force = false } = {}) {
  const descriptor = registry.get(key);
  if (!descriptor) throw new Error(`Dataset no registrado: ${key}`);
  if (!force && cache.has(key)) return cache.get(key);
  if (!force && pending.has(key)) return pending.get(key);

  const request = (async () => {
    const response = await fetch(descriptor.url);
    if (!response.ok) throw new Error(`No se pudo cargar ${descriptor.url}`);
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error(`Dataset no válido: ${key}`);

    const normalized = descriptor.normalize ? data.map(descriptor.normalize) : data;
    cache.set(key, normalized);
    return normalized;
  })();

  pending.set(key, request);
  try {
    return await request;
  } finally {
    if (pending.get(key) === request) pending.delete(key);
  }
}

export async function loadAvailable(keys) {
  const uniqueKeys = [...new Set(keys)];
  const settled = await Promise.allSettled(uniqueKeys.map(key => loadDataset(key)));
  const data = new Map();
  const errors = new Map();
  settled.forEach((result, index) => {
    if (result.status === "fulfilled") data.set(uniqueKeys[index], result.value);
    else errors.set(uniqueKeys[index], result.reason);
  });
  return { data, errors };
}

export function clearDatasetCache(key) {
  if (key) {
    cache.delete(key);
    pending.delete(key);
  } else {
    cache.clear();
    pending.clear();
  }
}
