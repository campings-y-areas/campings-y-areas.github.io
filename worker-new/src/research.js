function clone(value) { return JSON.parse(JSON.stringify(value ?? null)); }

function verifiedMedia(media) {
  if (!media || typeof media !== "object") return null;
  if (media.verified_exact !== true || !media.image_url || !media.source_page) return null;
  return {
    image_url: String(media.image_url),
    source_page: String(media.source_page),
    credit: media.credit ? String(media.credit) : "",
    verified_exact: true
  };
}

function sanitizeItem(item) {
  if (!item || typeof item !== "object") return null;
  const clean = clone(item);
  const media = verifiedMedia(item.verified_media ?? item.media);
  delete clean.media;
  delete clean.verified_media;
  if (media) clean.verified_media = media;
  return clean;
}

export function buildVerifiedEditorialMaterial(profile) {
  const source = Array.isArray(profile.editorial_material) ? profile.editorial_material : [];
  return source.map(stage => {
    const content = stage?.content ?? {};
    const lists = {};
    for (const key of ["places", "restaurants", "services", "workshops"]) {
      lists[key] = (Array.isArray(content[key]) ? content[key] : []).map(sanitizeItem).filter(Boolean);
    }
    return {
      driving_stage_id: stage.driving_stage_id,
      route_stage_key: stage.route_stage_key ?? null,
      content: lists
    };
  });
}
