import {
  decodeRoomCode,
  DUEL_PORT_BASE,
  DUEL_PORT_COUNT,
  encodeRoomCode,
  isValidRoomCode,
} from '@/logic/duelCode';

const CORNER_IPS = [
  '0.0.0.0',
  '10.0.0.1',
  '172.31.255.255',
  '192.168.1.7',
  '192.168.178.254',
  '255.255.255.255',
];

describe('encodeRoomCode / decodeRoomCode', () => {
  it('round-trips corner IPs across every port in the range', () => {
    for (const ip of CORNER_IPS) {
      for (let off = 0; off < DUEL_PORT_COUNT; off++) {
        const port = DUEL_PORT_BASE + off;
        const code = encodeRoomCode(ip, port);
        expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
        expect(decodeRoomCode(code)).toEqual({ ip, port });
      }
    }
  });

  it('rejects invalid IPs and out-of-range ports', () => {
    expect(() => encodeRoomCode('192.168.1', DUEL_PORT_BASE)).toThrow();
    expect(() => encodeRoomCode('192.168.1.256', DUEL_PORT_BASE)).toThrow();
    expect(() => encodeRoomCode('192.168.1.7', DUEL_PORT_BASE - 1)).toThrow();
    expect(() => encodeRoomCode('192.168.1.7', DUEL_PORT_BASE + DUEL_PORT_COUNT)).toThrow();
  });

  it('tolerates lowercase, missing dashes, spaces and confusable letters', () => {
    const code = encodeRoomCode('192.168.1.7', DUEL_PORT_BASE);
    const sloppy = code.toLowerCase().replace('-', ' ');
    expect(decodeRoomCode(sloppy)).toEqual({ ip: '192.168.1.7', port: DUEL_PORT_BASE });

    // O reads as 0, I/L read as 1.
    const withConfusables = code.replace(/0/g, 'O').replace(/1/g, 'I');
    expect(decodeRoomCode(withConfusables)).toEqual({ ip: '192.168.1.7', port: DUEL_PORT_BASE });
  });

  it('checksum catches a single-character typo', () => {
    const code = encodeRoomCode('192.168.178.254', DUEL_PORT_BASE + 3).replace('-', '');
    for (let i = 0; i < code.length; i++) {
      const wrong = code[i] === 'A' ? 'B' : 'A';
      const typo = code.slice(0, i) + wrong + code.slice(i + 1);
      expect(decodeRoomCode(typo)).toBeNull();
    }
  });

  it('rejects garbage and wrong lengths', () => {
    expect(decodeRoomCode('')).toBeNull();
    expect(decodeRoomCode('abc')).toBeNull();
    expect(decodeRoomCode('!!!!-!!!!')).toBeNull();
    expect(decodeRoomCode('AAAA-AAAA-AAAA')).toBeNull();
  });

  it('isValidRoomCode mirrors decode', () => {
    const code = encodeRoomCode('10.0.0.1', DUEL_PORT_BASE);
    expect(isValidRoomCode(code)).toBe(true);
    expect(isValidRoomCode('0000-0001')).toBe(false);
  });
});
