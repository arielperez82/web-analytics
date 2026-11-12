import { connect, createServer, type Server } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';

import { forwardPort } from './forward-port';

const listening = (server: Server): Promise<number> =>
  new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve(typeof address === 'object' && address ? address.port : 0);
    });
  });

const roundTrip = (port: number, message: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const socket = connect(port, '127.0.0.1', () => socket.write(message));
    socket.once('data', data => {
      socket.end();
      resolve(data.toString());
    });
    socket.once('error', reject);
  });

describe('forwardPort', () => {
  const servers: Server[] = [];
  afterEach(() => {
    servers.splice(0).forEach(server => server.close());
  });

  it('relays bytes between a local port and the target port', async () => {
    const echo = createServer(socket => socket.pipe(socket));
    const echoPort = await listening(echo);
    const forwarder = forwardPort({ host: '127.0.0.1', port: echoPort });
    const forwarderPort = await listening(forwarder);
    servers.push(echo, forwarder);

    expect(await roundTrip(forwarderPort, 'ping')).toBe('ping');
  });

  it('survives a target that refuses the connection', async () => {
    const refused = createServer();
    const refusedPort = await listening(refused);
    refused.close();
    const forwarder = forwardPort({ host: '127.0.0.1', port: refusedPort });
    const forwarderPort = await listening(forwarder);
    servers.push(forwarder);

    await new Promise<void>(resolve => {
      const socket = connect(forwarderPort, '127.0.0.1');
      socket.once('close', () => resolve());
      socket.once('error', () => undefined);
    });

    expect(forwarder.listening).toBe(true);
  });
});
