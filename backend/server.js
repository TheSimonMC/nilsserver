'use strict';

const http = require('node:http');
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const dns = require('node:dns').promises;

const PUBLIC_DIR = path.join(__dirname, 'public');
const PUBLIC_ADDRESS = process.env.MC_PUBLIC_ADDRESS || 'nilsserver.net';
const MC_HOST = process.env.MC_HOST || PUBLIC_ADDRESS;
const MC_PORT = Number.parseInt(process.env.MC_PORT || '25565', 10);
const MC_TIMEOUT_MS = Number.parseInt(process.env.MC_TIMEOUT_MS || '3500', 10);
const MC_PROTOCOL_VERSION = Number.parseInt(process.env.MC_PROTOCOL_VERSION || '-1', 10);
const WEB_PORT = Number.parseInt(process.env.PORT || '3000', 10);
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

function jsonResponse(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store, max-age=0',
    'access-control-allow-origin': CORS_ORIGIN,
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-allow-headers': 'content-type, accept',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function encodeVarInt(input) {
  let value = Number(input);
  if (!Number.isInteger(value)) throw new TypeError('VarInt value must be an integer');

  // Minecraft VarInt uses signed 32-bit two's-complement values encoded 7 bits at a time.
  value >>>= 0;

  const bytes = [];
  do {
    let temp = value & 0x7f;
    value >>>= 7;
    if (value !== 0) temp |= 0x80;
    bytes.push(temp);
  } while (value !== 0);

  return Buffer.from(bytes);
}

function readVarInt(buffer, offset = 0) {
  let numRead = 0;
  let result = 0;
  let read;

  do {
    if (offset + numRead >= buffer.length) return null;
    read = buffer[offset + numRead];
    const value = read & 0x7f;
    result |= value << (7 * numRead);
    numRead += 1;

    if (numRead > 5) {
      throw new Error('VarInt is too large');
    }
  } while ((read & 0x80) !== 0);

  return { value: result, bytes: numRead };
}

function encodeString(value) {
  const text = Buffer.from(String(value), 'utf8');
  return Buffer.concat([encodeVarInt(text.length), text]);
}

function packet(parts) {
  const body = Buffer.concat(parts);
  return Buffer.concat([encodeVarInt(body.length), body]);
}

function unsignedShort(value) {
  const output = Buffer.allocUnsafe(2);
  output.writeUInt16BE(value, 0);
  return output;
}

async function resolveMinecraftTarget(host, fallbackPort) {
  const port = Number.isInteger(fallbackPort) && fallbackPort > 0 ? fallbackPort : 25565;

  if (port !== 25565) return { host, port };

  try {
    const records = await dns.resolveSrv(`_minecraft._tcp.${host}`);
    if (records.length > 0) {
      const sorted = records.sort((a, b) => a.priority - b.priority || b.weight - a.weight);
      return { host: sorted[0].name, port: sorted[0].port };
    }
  } catch {
    // No SRV record or DNS resolution failed. Fall back to host:port.
  }

  return { host, port };
}

function parseStatusPacket(buffer) {
  const packetLengthInfo = readVarInt(buffer, 0);
  if (!packetLengthInfo) return null;

  const packetStart = packetLengthInfo.bytes;
  const packetEnd = packetStart + packetLengthInfo.value;
  if (buffer.length < packetEnd) return null;

  const payload = buffer.subarray(packetStart, packetEnd);
  let cursor = 0;

  const packetId = readVarInt(payload, cursor);
  if (!packetId) return null;
  cursor += packetId.bytes;

  if (packetId.value !== 0) {
    throw new Error(`Unexpected status packet id ${packetId.value}`);
  }

  const jsonLength = readVarInt(payload, cursor);
  if (!jsonLength) return null;
  cursor += jsonLength.bytes;

  const jsonEnd = cursor + jsonLength.value;
  if (payload.length < jsonEnd) return null;

  const jsonText = payload.subarray(cursor, jsonEnd).toString('utf8');
  return JSON.parse(jsonText);
}

async function pingMinecraftServer() {
  const target = await resolveMinecraftTarget(MC_HOST, MC_PORT);
  const started = process.hrtime.bigint();

  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let buffer = Buffer.alloc(0);
    let settled = false;

    const finish = (error, data) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error);
      else resolve(data);
    };

    socket.setTimeout(MC_TIMEOUT_MS);

    socket.once('timeout', () => finish(new Error('Minecraft server ping timed out')));
    socket.once('error', (error) => finish(error));

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);

      try {
        const response = parseStatusPacket(buffer);
        if (!response) return;

        const latencyMs = Number((Number(process.hrtime.bigint() - started) / 1_000_000).toFixed(1));
        finish(null, { response, latencyMs, target });
      } catch (error) {
        finish(error);
      }
    });

    socket.connect(target.port, target.host, () => {
      const handshake = packet([
        encodeVarInt(0x00),
        encodeVarInt(MC_PROTOCOL_VERSION),
        encodeString(PUBLIC_ADDRESS),
        unsignedShort(target.port),
        encodeVarInt(0x01),
      ]);

      const statusRequest = packet([encodeVarInt(0x00)]);
      socket.write(Buffer.concat([handshake, statusRequest]));
    });
  });
}

function safeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

async function handleStatus(req, res) {
  const checkedAt = new Date().toISOString();

  try {
    const { response, latencyMs } = await pingMinecraftServer();

    jsonResponse(res, 200, {
      live: true,
      source: 'direct-minecraft-ping',
      address: PUBLIC_ADDRESS,
      checkedAt,
      online: true,
      players: {
        online: safeNumber(response?.players?.online),
        max: safeNumber(response?.players?.max),
      },
      version: response?.version?.name || null,
      latencyMs,
    });
  } catch (error) {
    jsonResponse(res, 200, {
      live: true,
      source: 'direct-minecraft-ping',
      address: PUBLIC_ADDRESS,
      checkedAt,
      online: false,
      players: {
        online: null,
        max: null,
      },
      version: null,
      latencyMs: null,
      error: 'not_reachable',
    });
  }
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const requestedPath = decodeURIComponent(url.pathname);
  const relativePath = requestedPath === '/' ? '/index.html' : requestedPath;
  const filePath = path.normalize(path.join(PUBLIC_DIR, relativePath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (statError, stat) => {
    if (statError || !stat.isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const headers = {
      'content-type': contentTypes[ext] || 'application/octet-stream',
      'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=86400',
    };

    res.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Method not allowed');
    return;
  }

  if (req.url.startsWith('/api/status')) {
    handleStatus(req, res);
    return;
  }

  if (req.url.startsWith('/health')) {
    jsonResponse(res, 200, { ok: true });
    return;
  }

  serveStatic(req, res);
});

server.listen(WEB_PORT, () => {
  console.log(`nilsserver.net website running on http://localhost:${WEB_PORT}`);
  console.log(`Status route pings ${MC_HOST}:${MC_PORT} directly via Minecraft Server List Ping.`);
});
