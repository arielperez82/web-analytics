import { connect, createServer, type Server } from 'node:net';

export type ForwardTarget = {
  readonly host: string;
  readonly port: number;
};

export const forwardPort = ({ host, port }: ForwardTarget): Server =>
  createServer(client => {
    const upstream = connect(port, host);
    client.pipe(upstream);
    upstream.pipe(client);
    client.on('error', () => upstream.destroy());
    upstream.on('error', () => client.destroy());
    client.on('close', () => upstream.destroy());
    upstream.on('close', () => client.destroy());
  });
