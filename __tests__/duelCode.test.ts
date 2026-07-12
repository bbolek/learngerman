import {
  decodeRoomCode,
  DUEL_PORT_BASE,
  DUEL_PORT_COUNT,
  encodeRoomCode,
  isValidRoomCode,
  ROOM_CODE_LENGTH,
} from '@/logic/duelCode';

// Host and guest sit in the same /24 WLAN — the code carries only the
// host's last octet, the guest's own IP supplies the prefix.
const CASES: { host: string; guest: string }[] = [
  { host: '192.168.1.7', guest: '192.168.1.23' },
  { host: '192.168.178.254', guest: '192.168.178.1' },
  { host: '10.0.0.1', guest: '10.0.0.99' },
  { host: '172.31.255.255', guest: '172.31.255.4' },
  { host: '10.13.37.0', guest: '10.13.37.200' },
];

describe('encodeRoomCode / decodeRoomCode', () => {
  it('round-trips corner last-octets across every port in the range', () => {
    for (const { host, guest } of CASES) {
      for (let off = 0; off < DUEL_PORT_COUNT; off++) {
        const port = DUEL_PORT_BASE + off;
        const code = encodeRoomCode(host, port);
        expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}$/);
        expect(code).toHaveLength(ROOM_CODE_LENGTH);
        expect(decodeRoomCode(code, guest)).toEqual({ ip: host, port });
      }
    }
  });

  it('rebuilds the host address from the decoder’s own subnet', () => {
    const code = encodeRoomCode('192.168.1.7', DUEL_PORT_BASE);
    expect(decodeRoomCode(code, '10.0.0.42')).toEqual({ ip: '10.0.0.7', port: DUEL_PORT_BASE });
  });

  it('rejects invalid IPs and out-of-range ports', () => {
    expect(() => encodeRoomCode('192.168.1', DUEL_PORT_BASE)).toThrow();
    expect(() => encodeRoomCode('192.168.1.256', DUEL_PORT_BASE)).toThrow();
    expect(() => encodeRoomCode('192.168.1.7', DUEL_PORT_BASE - 1)).toThrow();
    expect(() => encodeRoomCode('192.168.1.7', DUEL_PORT_BASE + DUEL_PORT_COUNT)).toThrow();
  });

  it('returns null when the decoder has no usable own IP', () => {
    const code = encodeRoomCode('192.168.1.7', DUEL_PORT_BASE);
    expect(decodeRoomCode(code, '')).toBeNull();
    expect(decodeRoomCode(code, 'not-an-ip')).toBeNull();
  });

  it('tolerates lowercase, spaces and confusable letters', () => {
    const code = encodeRoomCode('192.168.1.7', DUEL_PORT_BASE);
    const sloppy = ` ${code.toLowerCase()} `;
    expect(decodeRoomCode(sloppy, '192.168.1.2')).toEqual({ ip: '192.168.1.7', port: DUEL_PORT_BASE });

    // O reads as 0, I/L read as 1.
    const withConfusables = code.replace(/0/g, 'O').replace(/1/g, 'I');
    expect(decodeRoomCode(withConfusables, '192.168.1.2')).toEqual({
      ip: '192.168.1.7',
      port: DUEL_PORT_BASE,
    });
  });

  it('checksum catches a single-character typo', () => {
    const code = encodeRoomCode('192.168.178.254', DUEL_PORT_BASE + 3);
    for (let i = 0; i < code.length; i++) {
      const wrong = code[i] === 'A' ? 'B' : 'A';
      const typo = code.slice(0, i) + wrong + code.slice(i + 1);
      expect(decodeRoomCode(typo, '192.168.178.1')).toBeNull();
    }
  });

  it('rejects garbage and wrong lengths', () => {
    expect(decodeRoomCode('', '192.168.1.2')).toBeNull();
    expect(decodeRoomCode('ab', '192.168.1.2')).toBeNull();
    expect(decodeRoomCode('!!!!', '192.168.1.2')).toBeNull();
    expect(decodeRoomCode('AAAA-AAAA', '192.168.1.2')).toBeNull();
  });

  it('isValidRoomCode mirrors decode without needing an IP', () => {
    const code = encodeRoomCode('10.0.0.1', DUEL_PORT_BASE);
    expect(isValidRoomCode(code)).toBe(true);
    expect(isValidRoomCode('0001')).toBe(false);
  });
});
