/**
 * TCP transport for the WLAN group duel — the only layer that touches
 * sockets. Host = server accepting one connection per class member, guest =
 * a single client connection. Frames are newline-delimited JSON (codec in
 * src/logic/duel.ts). Liveness comes from a per-peer ping/pong heartbeat
 * here; the reducer never sees ping/pong. The host addresses peers by
 * transport id ('g1', 'g2', …) which doubles as the player id in the
 * protocol layer; a guest knows its single peer as HOST_ID.
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
        socket.adoptPeer(HOST_ID, client);
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
        if (this.disposed) {
          client.destroy();
          return;
        }
        if (this.peers.size >= MAX_SOCKETS) {
          try {
            client.write(encodeFrame({ t: 'reject', reason: 'full' }));
            client.destroy();
          } catch {}
          return;
        }
        this.adoptPeer(`g${this.nextGuest++}`, client);
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

  private adoptPeer(id: string, sock: Socket) {
    const peer: PeerConn = { id, sock, buf: '', lastSeen: Date.now() };
    this.peers.set(id, peer);
    sock.setNoDelay(true);
    sock.on('data', (data) => {
      peer.lastSeen = Date.now();
      const { frames, rest } = splitFrames(peer.buf, data.toString());
      peer.buf = rest;
      for (const msg of frames) {
        if (msg.t === 'ping') this.write(peer, { t: 'pong' });
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
      for (const peer of [...this.peers.values()]) {
        if (Date.now() - peer.lastSeen > PEER_TIMEOUT_MS) this.fireGone(peer.id);
        else this.write(peer, { t: 'ping' });
      }
    }, HEARTBEAT_MS);
  }

  private write(peer: PeerConn, msg: DuelMsg) {
    try {
      peer.sock.write(encodeFrame(msg));
    } catch {
      // dying socket — heartbeat/close events will surface it
    }
  }

  /** Send to one peer (`to`) or to everyone connected (no `to`). */
  send(msg: DuelMsg, to?: string): void {
    if (this.disposed) return;
    if (to != null) {
      const peer = this.peers.get(to);
      if (peer) this.write(peer, msg);
      return;
    }
    for (const peer of this.peers.values()) this.write(peer, msg);
  }

  /** Deliberately disconnect one peer (after a targeted reject) — no callback. */
  dropPeer(id: string): void {
    const peer = this.peers.get(id);
    if (!peer) return;
    this.peers.delete(id);
    try {
      peer.sock.destroy();
    } catch {}
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
      try {
        peer.sock.destroy();
      } catch {}
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
