(function (root) {
  // Sum in integer hundredths so decimal creation gains remain stable.
  function attributes(data, base) {
    return Object.fromEntries(data.attributes.map(key => [key, Math.min(100,
      Object.entries(data.openingGains).reduce((sum, [name, gains]) =>
        sum + Math.round(gains[key] * 100) * base[name], 0) / 100)]));
  }

  function sources(data, stats, role) {
    return Object.fromEntries(data.attributes.map(key => [key, stats[key] * data.rolePower[role][key]]));
  }

  function contribution(data, stats, role) {
    return Object.values(sources(data, stats, role)).reduce((sum, value) => sum + value, 0);
  }

  function allocate(data, base, name, requested) {
    const other = Object.entries(base).reduce((sum, [key, value]) => sum + (key === name ? 0 : value), 0);
    return Math.max(0, Math.min(Math.floor(requested || 0), data.openingLimits[name], data.creationBudget - other));
  }

  const api = {attributes, sources, contribution, allocate};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CreatorModel = api;
})(globalThis);
