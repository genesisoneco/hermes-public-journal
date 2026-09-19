// In-memory limits for the habitat Durable Object. Nothing here touches KV
// or storage: it all resets when the object hibernates, which is fine.
import { CROWD } from '../../../assets/js/habitat/sim/rules.js';

export const DEFAULT_LIMITS = {
  maxConn: 300,     // global sockets (env HABITAT_MAX_CONN)
  perIpConn: 6,     // sockets per ipTag
  // One viewer tapping as fast as the client allows (1 per 220 ms) must be able
  // to reach CROWD.spam.teleportAt within the spam window, so ≥ 4.5/s.
  connRate: 5,      // msgs/s per connection
  connBurst: 6,
  ipRate: 5,        // msgs/s per ipTag (across its sockets + HTTP)
  ipBurst: 5,
  strikes: 3,       // bad / oversized / unknown frames before close 1008
  rateStrikes: 30,  // rate-limited frames before close 1008
};

export class Limits {
  constructor(opts) {
    this.o = Object.assign({}, DEFAULT_LIMITS, opts || {});
    this.buckets = new Map();
    this.strikes = new Map();
    this.rateHits = new Map();
    this.spam = [];       // timestamps of accepted interactions (global)
    this.sleepPokes = []; // timestamps of pokes while she sleeps
  }

  _take(key, rate, burst, now) {
    let b = this.buckets.get(key);
    if (!b) { b = { tokens: burst, at: now }; this.buckets.set(key, b); }
    b.tokens = Math.min(burst, b.tokens + ((now - b.at) / 1000) * rate);
    b.at = now;
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
  }

  _prune(now) {
    if (this.buckets.size < 4000) return;
    for (const [k, b] of this.buckets) if (now - b.at > 60000) this.buckets.delete(k);
  }

  // One inbound message from a socket. Checks the ip bucket first so a
  // single ip can't out-spend its budget by opening more sockets.
  allowMsg(connId, ipTag, now) {
    this._prune(now);
    const ipOk = this._take('ip:' + ipTag, this.o.ipRate, this.o.ipBurst, now);
    if (!ipOk) return false;
    return this._take('c:' + connId, this.o.connRate, this.o.connBurst, now);
  }

  allowIp(ipTag, now) {
    this._prune(now);
    return this._take('ip:' + ipTag, this.o.ipRate, this.o.ipBurst, now);
  }

  strike(connId) {
    const n = (this.strikes.get(connId) || 0) + 1;
    this.strikes.set(connId, n);
    return n;
  }

  rateStrike(connId) {
    const n = (this.rateHits.get(connId) || 0) + 1;
    this.rateHits.set(connId, n);
    return n;
  }

  forget(connId) {
    this.strikes.delete(connId);
    this.rateHits.delete(connId);
    this.buckets.delete('c:' + connId);
  }

  // Record an accepted interaction; returns how many happened in the window.
  spamHit(now) {
    const win = CROWD.spam.windowSec * 1000;
    this.spam.push(now);
    while (this.spam.length && now - this.spam[0] > win) this.spam.shift();
    if (this.spam.length > 500) this.spam.splice(0, this.spam.length - 500);
    return this.spam.length;
  }

  sleepPoke(now) {
    const win = CROWD.sleepWake.windowSec * 1000;
    this.sleepPokes.push(now);
    while (this.sleepPokes.length && now - this.sleepPokes[0] > win) this.sleepPokes.shift();
    return this.sleepPokes.length;
  }

  stats() {
    return { buckets: this.buckets.size, strikes: this.strikes.size, spamWindow: this.spam.length, opts: this.o };
  }
}
