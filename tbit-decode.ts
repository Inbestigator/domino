import type { Rotation } from ".";

export function decodeTbit(data: string) {
  const bits = data.split(",").filter(Boolean).map(Number) as number[];
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
