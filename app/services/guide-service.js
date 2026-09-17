function clone(value) {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

export function createGuideService({ remoteGenerate = null } = {}) {
  if (remoteGenerate != null && typeof remoteGenerate !== "function") {
    throw new TypeError("Generador remoto inválido");
  }

  return Object.freeze({
    async generate(payload, { demo = false } = {}) {
      if (demo) {
        if (!payload?.demoGuide) throw new Error("La demo no contiene guía predefinida");
        return clone(payload.demoGuide);
      }
      if (typeof remoteGenerate !== "function") {
        throw new Error("Generación remota no configurada");
      }
      return remoteGenerate(payload);
    }
  });
}
