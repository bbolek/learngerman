/**
 * Room codes for the WLAN multiplayer duel: 4 human-typable characters
 * ("K7QA"). Host and guests share the same WLAN, so the code only carries
 * what differs between them — the host's last IPv4 octet plus a small port
 * offset; the guest fills in the first three octets from its own address
 * (same /24 subnet, the standard for home and school WiFi). Crockford
 * base32 (no I/L/O/U) so codes survive being read aloud; the last character
 * is a checksum so a typo fails fast instead of hanging on a dead connect.
 * Pure module — no RN imports, no Date.now().
 */

export const DUEL_PORT_BASE = 47474;
export const DUEL_PORT_COUNT = 8;

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const PAYLOAD_CHARS = 3; // 15 bits — plenty for 11 (256 last-octets × 8 ports)

export const ROOM_CODE_LENGTH = PAYLOAD_CHARS + 1;

function parseIpv4(ip: string): number[] | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const octets = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN));
  return octets.every((o) => Number.isInteger(o) && o >= 0 && o <= 255) ? octets : null;
}

/** Host "192.168.1.7" + port in [DUEL_PORT_BASE, DUEL_PORT_BASE+7] → "XXXX". */
export function encodeRoomCode(hostIp: string, port: number): string {
  const octets = parseIpv4(hostIp);
  const offset = port - DUEL_PORT_BASE;
  if (!octets) throw new Error(`invalid IPv4: ${hostIp}`);
  if (offset < 0 || offset >= DUEL_PORT_COUNT) throw new Error(`port out of range: ${port}`);

  let value = octets[3] * DUEL_PORT_COUNT + offset;
  let chars = '';
  for (let i = 0; i < PAYLOAD_CHARS; i++) {
    chars = ALPHABET[value % 32] + chars;
    value = Math.floor(value / 32);
  }
  const checksum = ALPHABET[[...chars].reduce((sum, c) => sum + ALPHABET.indexOf(c), 0) % 32];
  return chars + checksum;
}

/** Uppercase, drop separators, map easily-confused letters onto the alphabet. */
function normalize(code: string): string {
  return code
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

/**
 * Tolerant inverse of encodeRoomCode; null for anything malformed. `myIp`
 * is the joining device's own IPv4 — it supplies the shared subnet prefix.
 */
export function decodeRoomCode(code: string, myIp: string): { ip: string; port: number } | null {
  const prefix = parseIpv4(myIp);
  if (!prefix) return null;

  const clean = normalize(code);
  if (clean.length !== ROOM_CODE_LENGTH) return null;

  const digits: number[] = [];
  for (const c of clean) {
    const d = ALPHABET.indexOf(c);
    if (d < 0) return null;
    digits.push(d);
  }
  const payload = digits.slice(0, PAYLOAD_CHARS);
  if (payload.reduce((sum, d) => sum + d, 0) % 32 !== digits[PAYLOAD_CHARS]) return null;

  let value = 0;
  for (const d of payload) value = value * 32 + d;

  const offset = value % DUEL_PORT_COUNT;
  const lastOctet = Math.floor(value / DUEL_PORT_COUNT);
  if (lastOctet > 255) return null;

  return {
    ip: `${prefix[0]}.${prefix[1]}.${prefix[2]}.${lastOctet}`,
    port: DUEL_PORT_BASE + offset,
  };
}

/** Live input feedback: true once the typed code is complete and checksum-valid. */
export function isValidRoomCode(code: string): boolean {
  return decodeRoomCode(code, '0.0.0.0') != null;
}
