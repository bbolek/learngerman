/**
 * TCP transport for the WLAN multiplayer duel — the only layer that touches
 * sockets. Host = server accepting one connection per class member, guest =
 * a single client connection. Frames are newline-delimited JSON (codec in
 * src/logic/duel.ts). Liveness comes from a per-peer ping/pong heartbeat
 * here; the reducer never sees ping/pong. The host addresses peers by
 * transport id ('g1', 'g2', …) which doubles as the player id in the
 * protocol layer; a guest knows its single peer as HOST_ID.
 *
 * Broadcasts only reach peers the app layer has addressed directly at
 * least once (i.e. welcomed) — a socket that connects but never completes
 * the handshake gets no room traffic and is dropped after a grace period.
 */

import * as Network from 'expo-network';
import TcpSocket from 'react-native-tcp-socket';
import type Server from 'react-native-tcp-socket/lib/types/Server';
import type Socket from 'react-native-tcp-socket/lib/types/Socket';

import { encodeFrame, HOST_ID, splitFrames, type DuelMsg } from '@/logic/duel';
import { DUEL_PORT_BASE, DUEL_PORT_COUNT } from '@/logic/duelCode';

const HEARTBEAT_MS = 2000;
/** Any traffic counts as liveness; three missed beats ends that peer. */
const PEER_TIMEOUT_MS = 6000;
const JOIN_TIMEOUT_MS = 8000;
/** A connection that never completes the hello/welcome handshake is cut. */
const GREET_TIMEOUT_MS = 10_000;
/** Delay before destroying a deliberately dropped socket, so the final
 * frame (e.g. a reject reason) flushes through the async native write. */
const DROP_LINGER_MS = 300;
/** Hard backstop above DUEL_MAX_PLAYERS so a socket flood can't pile up. */
const MAX_SOCKETS = 40;

export interface DuelSocketCallbacks {
  onMessage(msg: DuelMsg, from: string): void;
  /** A peer's socket died or went silent (host: that guest; guest: the host). */
  onPeerGone(id: string): void;
  /** Host only: the listening server itself died after startup. */
  onServerDown(): void;
}

export interface HostInfo {
  ip: string;
  port: number;
}

interface PeerConn {
  id: string;
  sock: Socket;
  buf: string;
  lastSeen: number;
  /** The app layer has sent this peer a targeted frame (welcome/reject). */
  greeted: boolean;
  adoptedAt: number;
}

export class DuelSocket {
  private server: Server | null = null;
  private peers = new Map<string, PeerConn>();
  private nextGuest = 1;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private disposed = false;

  private constructor(private cb: DuelSocketCallbacks) {}

  /** Bind a server on the first free duel port; resolves once listening. */
  static async host(cb: DuelSocketCallbacks): Promise<{ socket: DuelSocket; info: HostInfo }> {
    const ip = await Network.getIpAddressAsync();
    if (!ip || ip === '0.0.0.0') throw new Error('no-wifi');

    const socket = new DuelSocket(cb);
    for (let offset = 0; offset < DUEL_PORT_COUNT; offset++) {
      const port = DUEL_PORT_BASE + offset;
      try {
        await socket.listen(port);
        return { socket, info: { ip, port } };
      } catch {
        // port taken — try the next one
      }
    }
    throw new Error('no-free-port');
  }

  /** Connect to a host; resolves once the TCP connection is up. */
  static join(ip: string, port: number, cb: DuelSocketCallbacks): Promise<DuelSocket> {
    return new Promise((resolve, reject) => {
      const socket = new DuelSocket(cb);
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          client.destroy();
          reject(new Error('connect-timeout'));
        }
      }, JOIN_TIMEOUT_MS);

      const client = TcpSocket.createConnection({ host: ip, port }, () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        // The host is our only peer and always broadcast-eligible.
        socket.adoptPeer(HOST_ID, client, true);
        resolve(socket);
      });
      client.on('error', () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          client.destroy();
          reject(new Error('connect-failed'));
        } else {
          socket.fireGone(HOST_ID);
        }
      });
    });
  }

  private listen(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      let listening = false;
      const server = TcpSocket.createServer((client) => {
        if (this.disposed || this.peers.size >= MAX_SOCKETS) {
          try {
            client.destroy();
          } catch {}
          return;
        }
        this.adoptPeer(`g${this.nextGuest++}`, client, false);
      });
      server.on('error', () => {
        if (!listening) {
          server.close();
          reject(new Error('listen-failed'));
        } else if (!this.disposed) {
          this.cb.onServerDown();
        }
      });
      server.listen({ port, host: '0.0.0.0', reuseAddress: true }, () => {
        listening = true;
        this.server = server;
        resolve();
      });
    });
  }

  private adoptPeer(id: string, sock: Socket, greeted: boolean) {
    const peer: PeerConn = {
      id,
      sock,
      buf: '',
      lastSeen: Date.now(),
      greeted,
      adoptedAt: Date.now(),
    };
    this.peers.set(id, peer);
    sock.setNoDelay(true);
    sock.on('data', (data) => {
      peer.lastSeen = Date.now();
      const { frames, rest } = splitFrames(peer.buf, data.toString());
      peer.buf = rest;
      for (const msg of frames) {
        if (msg.t === 'ping') this.writeRaw(peer, encodeFrame({ t: 'pong' }));
        else if (msg.t !== 'pong') this.cb.onMessage(msg, id);
      }
    });
    sock.on('error', () => this.fireGone(id));
    sock.on('close', () => this.fireGone(id));
    this.ensureHeartbeat();
  }

  private ensureHeartbeat() {
    if (this.heartbeat) return;
    this.heartbeat = setInterval(() => {
      const now = Date.now();
      for (const peer of [...this.peers.values()]) {
        if (!peer.greeted && now - peer.adoptedAt > GREET_TIMEOUT_MS) {
          // Connected but never handshaked — cut it without telling the app
          // layer (the reducer never knew this socket existed).
          this.dropPeer(peer.id);
        } else if (now - peer.lastSeen > PEER_TIMEOUT_MS) {
          this.fireGone(peer.id);
        } else if (now - peer.lastSeen >= HEARTBEAT_MS) {
          // Game traffic already proves liveness — only ping quiet peers.
          this.writeRaw(peer, encodeFrame({ t: 'ping' }));
        }
      }
    }, HEARTBEAT_MS);
  }

  private writeRaw(peer: PeerConn, frame: string) {
    try {
      peer.sock.write(frame);
    } catch {
      // dying socket — heartbeat/close events will surface it
    }
  }

  /**
   * Send to one peer (`to`) or broadcast to every greeted peer, optionally
   * skipping `except` (the original sender of a relayed message).
   */
  send(msg: DuelMsg, to?: string, except?: string): void {
    if (this.disposed) return;
    if (to != null) {
      const peer = this.peers.get(to);
      if (peer) {
        peer.greeted = true;
        this.writeRaw(peer, encodeFrame(msg));
      }
      return;
    }
    const frame = encodeFrame(msg);
    for (const peer of this.peers.values()) {
      if (peer.greeted && peer.id !== except) this.writeRaw(peer, frame);
    }
  }

  /**
   * Deliberately disconnect one peer (after a targeted reject) — no
   * callback. The destroy is deferred so the last written frame flushes.
   */
  dropPeer(id: string): void {
    const peer = this.peers.get(id);
    if (!peer) return;
    this.peers.delete(id);
    setTimeout(() => {
      try {
        peer.sock.destroy();
      } catch {}
    }, DROP_LINGER_MS);
  }

  /** Peer went away. Cleans up and notifies exactly once per peer. */
  private fireGone(id: string) {
    const peer = this.peers.get(id);
    if (!peer || this.disposed) return;
    this.peers.delete(id);
    try {
      peer.sock.destroy();
    } catch {}
    this.cb.onPeerGone(id);
  }

  /** Local, deliberate teardown (leave/unmount) — never fires callbacks. */
  close(): void {
    if (this.disposed) return;
    this.send({ t: 'bye' });
    this.disposed = true;
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
    for (const peer of this.peers.values()) {
      const sock = peer.sock;
      // Give the bye a moment to flush before cutting the wire.
      setTimeout(() => {
        try {
          sock.destroy();
        } catch {}
      }, DROP_LINGER_MS);
    }
    this.peers.clear();
    if (this.server) {
      try {
        this.server.close();
      } catch {}
      this.server = null;
    }
  }
}
