import nodeTypes from "./node-types.json";

export function decodeTbit(data: string) {
  const bits = data.split(",").slice(0, -1).map(Number) as number[];
  const out = [];

  for (let i = 0; i < bits.length; i += 4) {
    const objectId = bits[i]!;
    const x = bits[i + 1]!;
    const y = bits[i + 2]!;
    const rotation = bits[i + 3]!;
    out.push([{ type: nodeTypes.find((t) => t.id === objectId), rotation }, x, -y]);
  }
}
