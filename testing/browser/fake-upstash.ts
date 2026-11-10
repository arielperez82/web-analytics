import { createServer, type Server } from 'node:http';

type Command = readonly [string, string, ...unknown[]];

const readBody = async (request: AsyncIterable<Buffer>): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
};

export const startFakeUpstash = async (
  port: number
): Promise<{ readonly url: string; readonly stop: () => Promise<void> }> => {
  const values = new Map<string, string>();
  const server: Server = createServer((request, response) => {
    void readBody(request)
      .then(body => {
        const [verb, key, value] = JSON.parse(body) as Command;
        if (verb !== 'GET' && verb !== 'SET')
          throw new Error(`unsupported command ${String(verb)}`);
        if (verb === 'SET') values.set(key, String(value));
        const result = verb === 'GET' ? (values.get(key) ?? null) : 'OK';
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ result }));
      })
      .catch((error: unknown) => {
        response.statusCode = 400;
        response.end(JSON.stringify({ error: String(error) }));
      });
  });
  await new Promise<void>(resolve => server.listen(port, resolve));
  return {
    url: `http://localhost:${port}`,
    stop: () =>
      new Promise<void>(resolve => {
        server.close(() => resolve());
      }),
  };
};
