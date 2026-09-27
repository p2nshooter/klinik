// Tiny method+path router with :params.
export class Router {
  constructor() {
    this.routes = [];
  }
  add(method, path, handler) {
    const keys = [];
    const re = new RegExp(
      '^' +
        path.replace(/\//g, '\\/').replace(/:(\w+)(\*)?/g, (_, k, star) => {
          keys.push(k);
          return star ? '(.+)' : '([^/]+)';
        }) +
        '\\/?$'
    );
    this.routes.push({ method, re, keys, handler });
    return this;
  }
  get(p, h) { return this.add('GET', p, h); }
  post(p, h) { return this.add('POST', p, h); }
  put(p, h) { return this.add('PUT', p, h); }
  del(p, h) { return this.add('DELETE', p, h); }
  match(method, path) {
    for (const r of this.routes) {
      if (r.method !== method && !(method === 'HEAD' && r.method === 'GET')) continue;
      const m = path.match(r.re);
      if (m) {
        const params = {};
        r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
        return { handler: r.handler, params };
      }
    }
    return null;
  }
}
