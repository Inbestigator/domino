import type { Rotation } from ".";

export function decodeTbit(data: Uint8Array) {
  const bits = data.toString().split(",").slice(0, -1).map(Number) as number[];
  const out: [number, number, number, Rotation][] = [];

  for (let i = 0; i < bits.length; i += 4) {
    const objectId = bits[i]!;
    const x = bits[i + 1]!;
    const y = bits[i + 2]!;
    const rotation = bits[i + 3]!;
    out.push([objectId, x, -y, rotation as Rotation]);
  }

  return out;
}
