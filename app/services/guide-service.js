export function createGuideService({ remoteGenerate }) {
  if (typeof remoteGenerate !== "function") throw new TypeError("Generador remoto no configurado");
  return Object.freeze({
    async generate(payload, { demo = false } = {}) {
      if (demo) {
        if (!payload?.demoGuide) throw new Error("La demo no contiene guía predefinida");
        return payload.demoGuide;
      }
      return remoteGenerate(payload);
    }
  });
}
