import type { Rotation } from ".";

export function encode(nodes: [number, number, number, Rotation][]) {
  const bytes = new Uint8Array(nodes.length * 5);
  nodes.forEach(([objectId, x, y, rotation], index) => {
    const x16 = x & 0xffff;
    const y16 = y & 0xffff;

    let encoded = 0n;
    encoded = (encoded << 6n) | BigInt(objectId & 0x3f);
    encoded = (encoded << 16n) | BigInt(x16);
    encoded = (encoded << 16n) | BigInt(y16);
    encoded = (encoded << 2n) | BigInt(rotation & 0x3);

    for (let i = 0; i < 5; i++) {
      const shift = BigInt((4 - i) * 8);
      bytes[index * 5 + i] = Number((encoded >> shift) & 0xffn);
    }
  });
  return bytes;
}

export function decode(bytes: Uint8Array) {
  if (bytes.length % 5 !== 0) {
    throw new Error("Corrupted data");
  }

  const objects: [number, number, number, Rotation][] = [];
  for (let i = 0; i < bytes.length; i += 5) {
    let value = 0n;
    for (let j = 0; j < 5; ++j) {
      value = (value << 8n) | BigInt(bytes[i + j]!);
    }

    const rotation = Number(value & 0x3n);
    value >>= 2n;

    const y = Number(value & 0xffffn);
    value >>= 16n;

    const x = Number(value & 0xffffn);
    value >>= 16n;

    const objectId = Number(value & 0x3fn);

    const signed16 = (n: number) => (n & 0x8000 ? n - 0x10000 : n);

    objects.push([objectId, signed16(x), signed16(y), rotation as Rotation]);
  }

  return objects;
}
