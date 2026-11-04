// Network layer. Connects to the game server over WebSocket; if no server is reachable it runs the
// exact same game core locally in the browser (offline practice vs bots).
import { GameServer } from '../shared/core.js';

const ADMIN_HASH = 'b17214f28bee1bf3bc6be0985d86422b3eb8a0bf34fda40c75ba6f597ca013a9';
async function offlineAdminCheck(pw) {
  if (!crypto?.subtle) return false;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pw));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('') === ADMIN_HASH;
}

export class Net {
  constructor() {
    this.handlers = new Map();
    this.ws = null;
    this.local = null;
    this.online = false;
    this.queue = [];
  }

  on(t, fn) {
    if (!this.handlers.has(t)) this.handlers.set(t, []);
    this.handlers.get(t).push(fn);
  }

  emit(m) {
    for (const fn of this.handlers.get(m.t) || []) fn(m);
  }

  serverUrl() {
    const q = new URLSearchParams(location.search).get('server');
    if (q) return q;
    if (window.REDACTED_SERVER) return window.REDACTED_SERVER;
    return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
  }

  async connect(guns) {
    this.guns = guns;
    if (location.protocol !== 'file:' && new URLSearchParams(location.search).get('offline') == null) {
      const ok = await this.tryWs(this.serverUrl());
      if (ok) { this.online = true; return true; }
    }
    this.goOffline();
    return false;
  }

  tryWs(url) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (v) => { if (!done) { done = true; resolve(v); } };
      let ws;
      try { ws = new WebSocket(url); } catch { return finish(false); }
      const to = setTimeout(() => { try { ws.close(); } catch {} finish(false); }, 8000);
      ws.onopen = () => { clearTimeout(to); this.ws = ws; finish(true); };
      ws.onerror = () => { clearTimeout(to); finish(false); };
      ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } this.emit(m); };
      ws.onclose = () => {
        clearTimeout(to);
        finish(false);
        if (this.ws === ws) { this.ws = null; this.online = false; this.emit({ t: 'disconnected' }); }
      };
    });
  }

  goOffline() {
    this.online = false;
    // Offline practice has no server, so the admin password is checked against its SHA-256 fingerprint
    // (the password itself is not stored in the browser code).
    this.local = new GameServer({ guns: this.guns, maxPlayers: 4, maxPerMatch: 4, adminCheck: offlineAdminCheck });
    this.client = this.local.connect({ send: (o) => this.deliver(o) });
    if (!this.timer) {
      let prev = performance.now();
      this.timer = setInterval(() => {
        const now = performance.now();
        this.local.tick(Math.min(0.25, (now - prev) / 1000));
        prev = now;
      }, 50);
    }
  }

  // While offline, keep trying to reach the server (it may still be waking up or restarting after an
  // update) and switch back online by itself. canSwitch() lets the menu say when switching is safe.
  startReconnect(canSwitch, onOnline) {
    if (this.retryTimer || location.protocol === 'file:' || new URLSearchParams(location.search).get('offline') != null) return;
    this.retryTimer = setInterval(async () => {
      if (this.ws || this.trying || !canSwitch()) return;
      this.trying = true;
      const ok = await this.tryWs(this.serverUrl());
      this.trying = false;
      if (!ok) return;
      clearInterval(this.retryTimer); this.retryTimer = null;
      this.online = true;
      clearInterval(this.timer); this.timer = null; this.local = null; this.client = null; // stop offline practice
      onOnline?.();
    }, 10000);
  }

  deliver(o) {
    this.queue.push(o);
    if (this.queue.length === 1) queueMicrotask(() => {
      const q = this.queue.splice(0);
      for (const m of q) this.emit(m);
    });
  }

  send(o) {
    if (this.ws) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
    else if (this.local) this.local.message(this.client, o);
  }
}
