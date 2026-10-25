// Tiny i18n layer: dictionaries live in src/core/lang/*.js and register themselves in I18n.dict[code].
const I18n = {
  lang: 'en', dict: {}, rtl: ['he', 'ar'],
  langs: [['en', 'English'], ['he', 'עברית'], ['ar', 'العربية'], ['es', 'Español'], ['fr', 'Français'], ['de', 'Deutsch'], ['ru', 'Русский'], ['pt', 'Português'], ['tr', 'Türkçe']],
  listeners: [],

  t(key, p) {
    const d = this.dict[this.lang], e = this.dict.en;
    let s = (d && d[key] !== undefined) ? d[key] : (e && e[key] !== undefined ? e[key] : key);
    if (p) s = s.replace(/\{(\w+)\}/g, (m, k) => (p[k] !== undefined ? p[k] : m));
    return s;
  },

  n(num) { try { return Number(num).toLocaleString(this.lang === 'ar' ? 'ar-EG' : this.lang === 'he' ? 'he-IL' : this.lang); } catch (e) { return String(num); } },

  isRTL() { return this.rtl.includes(this.lang); },

  setLang(code, silent) {
    if (!this.dict[code]) code = 'en';
    this.lang = code;
    document.documentElement.lang = code; document.documentElement.dir = this.isRTL() ? 'rtl' : 'ltr';
    document.body.classList.toggle('rtl', this.isRTL());
    if (typeof Settings !== 'undefined' && !silent) Settings.set('lang', code);
    this.apply();
    for (const f of this.listeners) { try { f(code); } catch (e) { console.error(e); } }
  },

  onChange(f) { this.listeners.push(f); },

  apply(root = document) {
    root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = this.t(el.dataset.i18n); });
    root.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = this.t(el.dataset.i18nPh); });
    root.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = this.t(el.dataset.i18nTitle); });
  },

  // turn the hard-coded `.name` / `.mode` fields of the data tables into live translated getters
  bindNames() {
    const def = (o, field, key) => { try { Object.defineProperty(o, field, { get: () => I18n.t(key), configurable: true, enumerable: true }); } catch (e) { /* frozen */ } };
    const each = (tbl, prefix, field = 'name') => { if (Array.isArray(tbl)) tbl.forEach((o, i) => def(o, field, `${prefix}.${o.id !== undefined ? o.id : i}`)); else for (const k in tbl) def(tbl[k], field, `${prefix}.${k}`); };
    each(WEAPONS, 'weapon'); each(WEAPONS, 'wmode', 'mode'); each(RARITY, 'rarity'); each(SIGHTS, 'sight'); each(AMMO, 'ammo'); each(THROWABLES, 'throw');
    each(BIKE_DEFS, 'bike'); each(SKINS, 'skin'); each(DIFFICULTY, 'diff'); each(TODS, 'tod');
    POIS.forEach((p, i) => def(p, 'n', 'poi.' + i));
  }
};
