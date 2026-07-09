/**
 * TCP transport for the WLAN duel — the only layer that touches sockets.
 * Host = server on the first free port of the duel range, guest = client.
 * Frames are newline-delimited JSON (codec in src/logic/duel.ts). Liveness
 * comes from a ping/pong heartbeat here; the reducer never sees ping/pong.
 */

import * as Network from 'expo-network';
import TcpSocket from 'react-native-tcp-socket';
import type Server from 'react-native-tcp-socket/lib/types/Server';
import type Socket from 'react-native-tcp-socket/lib/types/Socket';

import { encodeFrame, splitFrames, type DuelMsg } from '@/logic/duel';
import { DUEL_PORT_BASE, DUEL_PORT_COUNT } from '@/logic/duelCode';

const HEARTBEAT_MS = 2000;
/** Any traffic counts as liveness; three missed beats ends the session. */
const PEER_TIMEOUT_MS = 6000;
const JOIN_TIMEOUT_MS = 8000;

export interface DuelSocketCallbacks {
  onMessage(msg: DuelMsg): void;
  /** Host only: a guest connected (guest resolves join() instead). */
  onPeerConnected(): void;
  /** Peer socket died or went silent. Fired at most once. */
  onClosed(): void;
}

export interface HostInfo {
  ip: string;
  port: number;
}

export class DuelSocket {
  private server: Server | null = null;
  private peer: Socket | null = null;
  private buf = '';
  private lastSeen = 0;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private closedFired = false;
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
        socket.adoptPeer(client);
        resolve(socket);
      });
      client.on('error', () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          client.destroy();
          reject(new Error('connect-failed'));
        } else {
          socket.fireClosed();
        }
      });
    });
  }

  private listen(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      let listening = false;
      const server = TcpSocket.createServer((client) => {
        if (this.peer) {
          // Room already occupied — turn the stranger away politely.
          client.write(encodeFrame({ t: 'reject', reason: 'busy' }));
          client.destroy();
          return;
        }
        this.adoptPeer(client);
        this.cb.onPeerConnected();
      });
      server.on('error', () => {
        if (!listening) {
          server.close();
          reject(new Error('listen-failed'));
        } else {
          this.fireClosed();
        }
      });
      server.listen({ port, host: '0.0.0.0', reuseAddress: true }, () => {
        listening = true;
        this.server = server;
        resolve();
      });
    });
  }

  private adoptPeer(peer: Socket) {
    this.peer = peer;
    this.closedFired = false; // a fresh peer gets its own close notification
    this.buf = '';
    this.lastSeen = Date.now();
    peer.setNoDelay(true);
    peer.on('data', (data) => {
      this.lastSeen = Date.now();
      const { frames, rest } = splitFrames(this.buf, data.toString());
      this.buf = rest;
      for (const msg of frames) {
        if (msg.t === 'ping') this.send({ t: 'pong' });
        else if (msg.t !== 'pong') this.cb.onMessage(msg);
      }
    });
    peer.on('error', () => this.fireClosed());
    peer.on('close', () => this.fireClosed());

    this.heartbeat = setInterval(() => {
      if (Date.now() - this.lastSeen > PEER_TIMEOUT_MS) {
        this.fireClosed();
        return;
      }
      this.send({ t: 'ping' });
    }, HEARTBEAT_MS);
  }

  send(msg: DuelMsg): void {
    if (!this.peer || this.disposed) return;
    try {
      this.peer.write(encodeFrame(msg));
    } catch {
      // dying socket — heartbeat/close events will surface it
    }
  }

  /** Peer went away. Cleans up and notifies exactly once; safe to re-enter. */
  private fireClosed() {
    if (this.closedFired || this.disposed) return;
    this.closedFired = true;
    this.teardownPeer();
    this.cb.onClosed();
  }

  private teardownPeer() {
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {}
      this.peer = null;
    }
  }

  /** Local, deliberate teardown (leave/unmount) — never calls onClosed. */
  close(): void {
    if (this.disposed) return;
    this.send({ t: 'bye' });
    this.disposed = true;
    this.teardownPeer();
    if (this.server) {
      try {
        this.server.close();
      } catch {}
      this.server = null;
    }
  }
}
