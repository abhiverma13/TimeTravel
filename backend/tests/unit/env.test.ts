import { parsePort } from '../../src/config/env';

describe('parsePort', () => {
  // Input: no PORT, a blank one, and ports written with spaces
  // Expected behavior: unset or blank means the local default; spaces around a number are ignored
  // Expected output: 3000, 3000, 8080 and 443
  test('Reads the port, or defaults to 3000', () => {
    expect(parsePort(undefined)).toBe(3000);
    expect(parsePort('   ')).toBe(3000);
    expect(parsePort('8080')).toBe(8080);
    expect(parsePort(' 443 ')).toBe(443);
  });

  // Input: 0, 65536 and a word
  // Expected behavior: the server refuses to start rather than listen on a port that cannot exist
  // Expected output: "Invalid PORT: <value>" each time
  test.each(['0', '65536', 'https'])('Refuses PORT=%p', (rawPort) => {
    expect(() => parsePort(rawPort)).toThrow(`Invalid PORT: ${rawPort}`);
  });
});
