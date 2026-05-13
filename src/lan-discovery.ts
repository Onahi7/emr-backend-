/**
 * LAN Discovery Responder for the Hobour LIS Backend.
 *
 * When Electron desktop clients are on the same LAN, they broadcast a UDP
 * discovery packet looking for the backend. This responder listens for those
 * packets and replies with the backend's address and port.
 *
 * Usage:
 *   Import and call startLanDiscovery(port) in your main.ts after the
 *   NestJS app starts listening.
 *
 *   Example:
 *     import { startLanDiscovery } from './lan-discovery';
 *     const port = 3000;
 *     await app.listen(port);
 *     startLanDiscovery(port);
 */

import * as dgram from 'dgram';

const DISCOVERY_PORT = 41234;
const DISCOVERY_MSG = 'HOBOUR_LIS_DISCOVER';
const DISCOVERY_REPLY = 'HOBOUR_LIS_HERE';

export function startLanDiscovery(backendPort: number): void {
  const server = dgram.createSocket('udp4');

  server.on('message', (msg, rinfo) => {
    if (msg.toString().trim() === DISCOVERY_MSG) {
      const reply = Buffer.from(`${DISCOVERY_REPLY}:${backendPort}`);
      server.send(reply, rinfo.port, rinfo.address, (err) => {
        if (err) {
          console.error('[LAN Discovery] Failed to send reply:', err);
        }
      });
    }
  });

  server.on('error', (err) => {
    console.error('[LAN Discovery] Server error:', err);
    server.close();
  });

  server.bind(DISCOVERY_PORT, '0.0.0.0', () => {
    server.setBroadcast(true);
    console.log(
      `[LAN Discovery] Listening on UDP port ${DISCOVERY_PORT} (all interfaces)`,
    );
  });
}
