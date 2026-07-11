/**
 * Room codes for the WLAN duel: the host's IPv4 address plus a small port
 * offset packed into 8 human-typable characters ("K7Q2-ZP9A"). Crockford
 * base32 (no I/L/O/U) so codes survive being read aloud; the last character
 * is a checksum so a typo fails fast instead of hanging on a dead connect.
 * Pure module — no RN imports, no Date.now().
 */

export const DUEL_PORT_BASE = 47474;
export const DUEL_PORT_COUNT = 8;

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const PAYLOAD_CHARS = 7; // 35 bits: 32-bit IPv4 + 3-bit port offset

function parseIpv4(ip: string): number[] | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const octets = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN));
  return octets.every((o) => Number.isInteger(o) && o >= 0 && o <= 255) ? octets : null;
}

/** "192.168.1.7" + port in [DUEL_PORT_BASE, DUEL_PORT_BASE+7] → "XXXX-XXXX". */
export function encodeRoomCode(ipv4: string, port: number): string {
  const octets = parseIpv4(ipv4);
  const offset = port - DUEL_PORT_BASE;
  if (!octets) throw new Error(`invalid IPv4: ${ipv4}`);
  if (offset < 0 || offset >= DUEL_PORT_COUNT) throw new Error(`port out of range: ${port}`);

  // 35 bits exceed safe bitwise range, so pack arithmetically (fits in 2^53).
  let value = 0;
  for (const o of octets) value = value * 256 + o;
  value = value * DUEL_PORT_COUNT + offset;

  let chars = '';
  for (let i = 0; i < PAYLOAD_CHARS; i++) {
    chars = ALPHABET[value % 32] + chars;
    value = Math.floor(value / 32);
  }
  const checksum = ALPHABET[[...chars].reduce((sum, c) => sum + ALPHABET.indexOf(c), 0) % 32];
  const code = chars + checksum;
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** Uppercase, drop separators, map easily-confused letters onto the alphabet. */
function normalize(code: string): string {
  return code
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

/** Tolerant inverse of encodeRoomCode; null for anything malformed. */
export function decodeRoomCode(code: string): { ip: string; port: number } | null {
  const clean = normalize(code);
  if (clean.length !== PAYLOAD_CHARS + 1) return null;

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
  value = Math.floor(value / DUEL_PORT_COUNT);
  const octets = [];
  for (let i = 0; i < 4; i++) {
    octets.unshift(value % 256);
    value = Math.floor(value / 256);
  }
  if (value !== 0) return null;
  return { ip: octets.join('.'), port: DUEL_PORT_BASE + offset };
}

/** Live input feedback: true once the typed code is complete and checksum-valid. */
export function isValidRoomCode(code: string): boolean {
  return decodeRoomCode(code) != null;
}
