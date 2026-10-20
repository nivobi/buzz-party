import { parseBoot2, readSerial } from '../src/core/iso.js';
import { makeIso, tmpFile } from './helpers/make-iso.js';

test('parseBoot2 turns the boot path into a serial', () => {
  expect(parseBoot2('BOOT2 = cdrom0:\\SCUS_975.97;1 \r\nVER = 1.00')).toBe('SCUS-97597');
  expect(parseBoot2('VER = 1.00')).toBeNull();
});

test('readSerial finds SYSTEM.CNF inside an ISO', async () => {
  const p = tmpFile(makeIso({ 'OTHER.BIN': 'x', 'SYSTEM.CNF': 'BOOT2 = cdrom0:\\SLES_123.45;1\n' }));
  expect(await readSerial(p)).toBe('SLES-12345');
});

test('readSerial returns null for junk and truncated images', async () => {
  expect(await readSerial(tmpFile(Buffer.from('nope')))).toBeNull();
  const full = makeIso({ 'SYSTEM.CNF': 'BOOT2 = cdrom0:\\SCUS_975.97;1\n' });
  expect(await readSerial(tmpFile(full.subarray(0, 18 * 2048 + 100)))).toBeNull();
});
