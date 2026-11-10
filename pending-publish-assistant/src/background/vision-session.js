(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DxmVisionSession = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  function sanitizeFailures(items) {
    return (Array.isArray(items) ? items : []).map(item => ({
      provider_id: String(item?.provider_id || ''),
      attempt: Math.max(1, Number(item?.attempt || 1)),
      reason: String(item?.reason || 'ProviderUnavailable')
    })).filter(item => item.provider_id);
  }

  function matches(session, event) {
    return Boolean(session && event && session.batchId === event.batchId &&
      Number(event.generation) === Number(session.generation));
  }

  function recordSuccess(session, event) {
    if (!matches(session, event)) return session;
    const providerId = String(event.providerId || '');
    const currentIndex = session.order.indexOf(session.mainProviderId);
    const providerIndex = session.order.indexOf(providerId);
    if (providerIndex < 0 || providerIndex < Math.max(0, currentIndex)) return session;
    const failures = sanitizeFailures(event.fallbackHistory);
    const unavailable = new Set(session.unavailableProviderIds || []);
    failures.forEach(item => unavailable.add(item.provider_id));
    session.order.slice(0, providerIndex).forEach(id => unavailable.add(id));
    const order = session.order.slice(providerIndex).filter(id => id === providerId || !unavailable.has(id));
    return {
      ...session,
      order,
      mainProviderId: providerId,
      mainModelId: String(event.modelId || session.mainModelId || ''),
      status: 'ready',
      unavailableProviderIds: [...unavailable],
      lastFailures: failures,
      generation: providerId === session.mainProviderId ? session.generation : session.generation + 1,
      updatedAt: Date.now()
    };
  }

  function recordUnavailable(session, event) {
    if (!matches(session, event)) return session;
    const failures = sanitizeFailures(event.fallbackHistory);
    return {
      ...session,
      mainProviderId: '',
      mainModelId: '',
      status: 'unavailable',
      unavailableProviderIds: [...new Set([...(session.unavailableProviderIds || []), ...failures.map(x => x.provider_id)])],
      lastFailures: failures,
      generation: session.generation + 1,
      updatedAt: Date.now()
    };
  }

  return { sanitizeFailures, recordSuccess, recordUnavailable };
});
