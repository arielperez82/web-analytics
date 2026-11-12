import { forwardPort } from './forward-port';

const [listenPort, host, port] = process.argv.slice(2).map(String);

if (!listenPort || !host || !port) {
  console.error('usage: forward-port-cli <listenPort> <host> <port>');
  process.exit(1);
}

forwardPort({ host, port: Number(port) }).listen(
  Number(listenPort),
  '127.0.0.1',
  () => console.log(`forwarding 127.0.0.1:${listenPort} -> ${host}:${port}`)
);
