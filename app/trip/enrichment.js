function distanceSq(a, b) {
  const lat = Number(a.lat) - Number(b.lat);
  const lon = Number(a.lon) - Number(b.lon);
  return lat * lat + lon * lon;
}

function nearest(items, point, limit) {
  return items
    .filter(item => Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lon ?? item.lng)))
    .map(item => ({ ...item, lon: Number(item.lon ?? item.lng) }))
    .sort((a, b) => distanceSq(a, point) - distanceSq(b, point))
    .slice(0, limit);
}

export function enrichStages({ stages, catalogs = {}, limits = {} }) {
  return stages.map(stage => {
    const anchor = stage.overnight ?? stage.to;
    return {
      ...stage,
      content: {
        places: nearest(catalogs.places ?? [], anchor, limits.places ?? 12),
        services: nearest(catalogs.services ?? [], anchor, limits.services ?? 8),
        restaurants: nearest(catalogs.restaurants ?? [], anchor, limits.restaurants ?? 8),
        workshops: nearest(catalogs.workshops ?? [], anchor, limits.workshops ?? 5),
        regulations: catalogs.regulations ?? []
      }
    };
  });
}
