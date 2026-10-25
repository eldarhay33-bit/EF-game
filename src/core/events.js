// Minimal event bus used by missions / achievements / tutorial: Events.emit('kill', {...}); Events.on('kill', fn).
const Events = {
  h: {},
  on(name, fn) { (this.h[name] || (this.h[name] = [])).push(fn); return () => this.off(name, fn); },
  off(name, fn) { const a = this.h[name]; if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } },
  emit(name, data) { const a = this.h[name]; if (!a) return; for (const f of a.slice()) { try { f(data); } catch (e) { console.error('[event]', name, e); } } }
};
