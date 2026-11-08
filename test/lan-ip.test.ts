import type { NetworkInterfaceInfo } from 'node:os';
import { pickLanIp } from '../src/core/lan-ip.js';

const v4 = (address: string, internal = false): NetworkInterfaceInfo =>
  ({ address, family: 'IPv4', internal, netmask: '255.255.255.0', mac: '00:00:00:00:00:00', cidr: null });
const v6 = (address: string, internal = false): NetworkInterfaceInfo =>
  ({ address, family: 'IPv6', internal, netmask: 'ffff::', mac: '00:00:00:00:00:00', cidr: null, scopeid: 0 });

test('skips docker, tailscale and loopback', () => {
  expect(pickLanIp({
    lo0: [v4('127.0.0.1', true)],
    docker0: [v4('172.17.0.1')],
    utun4: [v4('100.101.1.2')],
    en0: [v4('192.168.0.23')],
  })).toBe('192.168.0.23');
});

test('prefers the default-route interface', () => {
  expect(pickLanIp({ en0: [v4('192.168.1.9')], en7: [v4('10.0.0.5')] }, 'en7')).toBe('10.0.0.5');
});

test('null when only link-local and IPv6', () => {
  expect(pickLanIp({ en0: [v4('169.254.3.4'), v6('fe80::1')], lo0: [v6('::1', true)] })).toBeNull();
});

test('skips VM bridges', () => {
  expect(pickLanIp({ bridge100: [v4('192.168.64.1')], en0: [v4('192.168.1.9')] })).toBe('192.168.1.9');
});

test('skips CGNAT/Tailscale range even on an innocent name', () => {
  expect(pickLanIp({ en5: [v4('100.80.1.1')], en1: [v4('192.168.1.50')] }, 'en5')).toBe('192.168.1.50');
});

test('skips Parallels, ZeroTier, WireGuard and Apple peer-to-peer adapters', () => {
  expect(pickLanIp({
    vnic0: [v4('10.211.55.2')],
    vnic1: [v4('10.37.129.2')],
    zt0abcd: [v4('10.147.17.5')],
    wg0: [v4('10.8.0.2')],
    awdl0: [v4('192.168.99.1')],
    en0: [v4('192.168.1.9')],
  })).toBe('192.168.1.9');
});

test('buzz0 is never the join address', () => {
  expect(pickLanIp({ buzz0: [v4('10.42.0.1')], wlp4s0: [v4('192.168.0.92')] }, 'buzz0')).toBe('192.168.0.92');
  expect(pickLanIp({ buzz0: [v4('10.42.0.1')] })).toBeNull();
});
