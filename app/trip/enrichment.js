function radians(value) { return value * Math.PI / 180; }

function distanceKm(a, b) {
  const latA = Number(a?.lat);
  const lonA = Number(a?.lon ?? a?.lng);
  const latB = Number(b?.lat);
  const lonB = Number(b?.lon ?? b?.lng);
  if (![latA, lonA, latB, lonB].every(Number.isFinite)) return Infinity;
  const earth = 6371;
  const dLat = radians(latB - latA);
  const dLon = radians(lonB - lonA);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(radians(latA)) * Math.cos(radians(latB)) * Math.sin(dLon / 2) ** 2;
  return earth * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function nearest(items, point, limit) {
  return items
    .map(item => ({ item: { ...item, lon: Number(item.lon ?? item.lng) }, km: distanceKm(item, point) }))
    .filter(entry => Number.isFinite(entry.km))
    .sort((a, b) => a.km - b.km)
    .slice(0, limit)
    .map(entry => ({ ...entry.item, distance_km: entry.km }));
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
