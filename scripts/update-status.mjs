import { promises as dns } from "node:dns";
import fs from "node:fs/promises";
import net from "node:net";

const ADDRESS = process.env.MC_ADDRESS || "nilsserver.net";
const OUTPUT = process.env.STATUS_OUTPUT || "status.json";
const TIMEOUT_MS = Number(process.env.MC_TIMEOUT_MS || 6500);
const PROTOCOL_VERSION = Number(process.env.MC_PROTOCOL_VERSION || -1);

function splitAddress(address) {
  const trimmed = String(address || "").trim();
  const lastColon = trimmed.lastIndexOf(":");
  if (lastColon > -1 && /^\d+$/.test(trimmed.slice(lastColon + 1))) {
    return {
      host: trimmed.slice(0, lastColon),
      port: Number(trimmed.slice(lastColon + 1)),
    };
  }
  return { host: trimmed, port: 25565 };
}

async function resolveMinecraftAddress(address) {
  const parsed = splitAddress(address);

  if (parsed.port !== 25565) return parsed;

  try {
    const records = await dns.resolveSrv(`_minecraft._tcp.${parsed.host}`);
    if (records.length) {
      const sorted = records.sort((a, b) => a.priority - b.priority || b.weight - a.weight);
      return {
        host: sorted[0].name,
        port: sorted[0].port,
        srv: true,
      };
    }
  } catch {
    // Kein SRV-Record oder DNS nicht erreichbar: Standard-Port verwenden.
  }

  return parsed;
}

function writeVarInt(value) {
  const bytes = [];
  let val = value >>> 0;
  while (true) {
    if ((val & ~0x7f) === 0) {
      bytes.push(val);
      return Buffer.from(bytes);
    }
    bytes.push((val & 0x7f) | 0x80);
    val >>>= 7;
  }
}

function writeString(value) {
  const data = Buffer.from(String(value), "utf8");
  return Buffer.concat([writeVarInt(data.length), data]);
}

function createPacket(id, payload = Buffer.alloc(0)) {
  const packetId = writeVarInt(id);
  const body = Buffer.concat([packetId, payload]);
  return Buffer.concat([writeVarInt(body.length), body]);
}

function createHandshake(host, port) {
  const payload = Buffer.concat([
    writeVarInt(PROTOCOL_VERSION),
    writeString(host),
    Buffer.from([(port >> 8) & 0xff, port & 0xff]),
    writeVarInt(1),
  ]);
  return createPacket(0, payload);
}

function readVarInt(buffer, offset = 0) {
  let result = 0;
  let shift = 0;
  let cursor = offset;

  while (cursor < buffer.length) {
    const byte = buffer[cursor];
    result |= (byte & 0x7f) << shift;
    cursor += 1;

    if ((byte & 0x80) !== 0x80) {
      return { value: result, size: cursor - offset };
    }

    shift += 7;
    if (shift > 35) throw new Error("VarInt zu lang");
  }

  return null;
}

function tryReadStatusJson(buffer) {
  let offset = 0;
  const packetLength = readVarInt(buffer, offset);
  if (!packetLength) return null;
  offset += packetLength.size;

  if (buffer.length < offset + packetLength.value) return null;

  const packetId = readVarInt(buffer, offset);
  if (!packetId) return null;
  offset += packetId.size;

  const jsonLength = readVarInt(buffer, offset);
  if (!jsonLength) return null;
  offset += jsonLength.size;

  if (buffer.length < offset + jsonLength.value) return null;

  const json = buffer.subarray(offset, offset + jsonLength.value).toString("utf8");
  return JSON.parse(json);
}

function pingServer({ host, port }, visibleAddress) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const socket = net.createConnection({ host, port });
    let buffer = Buffer.alloc(0);
    let settled = false;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      fn(value);
    };

    const timeout = setTimeout(() => {
      finish(reject, new Error("Timeout"));
    }, TIMEOUT_MS);

    socket.on("connect", () => {
      const handshake = createHandshake(visibleAddress, port);
      const request = createPacket(0);
      socket.write(Buffer.concat([handshake, request]));
    });

    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      try {
        const status = tryReadStatusJson(buffer);
        if (!status) return;
        clearTimeout(timeout);
        finish(resolve, {
          status,
          latencyMs: Date.now() - started,
        });
      } catch (error) {
        clearTimeout(timeout);
        finish(reject, error);
      }
    });

    socket.on("error", (error) => {
      clearTimeout(timeout);
      finish(reject, error);
    });

    socket.on("end", () => {
      if (!settled) {
        clearTimeout(timeout);
        finish(reject, new Error("Verbindung beendet"));
      }
    });
  });
}

function cleanDescription(description) {
  if (!description) return null;
  if (typeof description === "string") return description;
  if (typeof description.text === "string") return description.text;
  return null;
}

async function writeStatus(payload) {
  await fs.writeFile(OUTPUT, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function main() {
  const updatedAt = new Date().toISOString();
  const resolved = await resolveMinecraftAddress(ADDRESS);

  try {
    const { status, latencyMs } = await pingServer(resolved, splitAddress(ADDRESS).host);
    const payload = {
      online: true,
      players: {
        online: typeof status.players?.online === "number" ? status.players.online : null,
        max: typeof status.players?.max === "number" ? status.players.max : null,
      },
      address: ADDRESS,
      host: resolved.host,
      port: resolved.port,
      latencyMs,
      updatedAt,
      description: cleanDescription(status.description),
      source: "direct-minecraft-server-ping",
    };

    await writeStatus(payload);
    console.log(`Online: ${payload.players.online ?? "?"}/${payload.players.max ?? "?"} (${latencyMs}ms)`);
  } catch (error) {
    const payload = {
      online: false,
      players: {
        online: null,
        max: null,
      },
      address: ADDRESS,
      host: resolved.host,
      port: resolved.port,
      updatedAt,
      error: error.message,
      source: "direct-minecraft-server-ping",
    };

    await writeStatus(payload);
    console.log(`Offline/Nicht erreichbar: ${error.message}`);
  }
}

main().catch(async (error) => {
  await writeStatus({
    online: false,
    players: { online: null, max: null },
    address: ADDRESS,
    updatedAt: new Date().toISOString(),
    error: error.message,
    source: "direct-minecraft-server-ping",
  });
  console.error(error);
  process.exitCode = 0;
});
