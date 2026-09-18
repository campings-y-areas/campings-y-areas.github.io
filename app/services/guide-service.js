export function createGuideService({ remoteGenerate = null } = {}) {
  if (remoteGenerate != null && typeof remoteGenerate !== "function") {
    throw new TypeError("Generador remoto inválido");
  }

  return Object.freeze({
    async generate(payload) {
      if (typeof remoteGenerate !== "function") {
        throw new Error("Generación remota no configurada");
      }
      return remoteGenerate(payload);
    }
  });
}
