import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { emitKeypressEvents } from "node:readline";
import { decode, encode } from "./savedata";
import nodeTypes from "./node-types.json";
import { render, input } from "./rendering";
import { decodeTbit } from "./tbit-decode";

const directions = ["right", "up", "left", "down"] as const;

type Direction = (typeof directions)[number];
type NodeState = "falling" | "fallen" | "standing";
export type Rotation = 0 | 1 | 2 | 3;

export interface Node {
  id: string;
  position: { x: number; y: number };
  type: NodeType;
  state: NodeState;
  rotation: Rotation;
}

type Action =
  | { action: "changeState"; state: NodeState }
  | { action: "knock"; direction: Direction };

interface Interaction {
  do: Action[];
  priority: number;
}

interface NodeType {
  id: number;
  meta: {
    variants: string[];
  };
  on: {
    knockedRight?: Interaction;
    knockedUp?: Interaction;
    knockedLeft?: Interaction;
    knockedDown?: Interaction;
  };
}

export const nodes = new Map<`${number},${number}`, Node>();

const queue = new Map<string, [Interaction, { x: number; y: number }]>();
function queueInteraction(key: string, interaction: Interaction, node: Node) {
  const existing = queue.get(key);
  if (!existing || interaction.priority > existing[0].priority) {
    queue.set(key, [interaction, node.position]);
  }
}

const actions = {
  knock(action: { direction: Direction }, node: Node) {
    const x = node.position.x + dirX(action.direction);
    const y = node.position.y + dirY(action.direction);
    const next = nodes.get(`${x},${y}`);
    const interaction = next ? getRotatedInteraction(next, action.direction) : undefined;
    if (!next || !interaction || next.state !== "standing") return;
    queueInteraction(next.id, interaction, next);
  },
  changeState(action: { state: NodeState }, node: Node) {
    node.state = action.state;
    if (node.state === "falling") {
      queueInteraction(
        crypto.randomUUID(),
        { do: [{ action: "changeState", state: "fallen" }], priority: 1 },
        node
      );
    }
  },
};

setInterval(() => {
  const prev = new Map(queue);
  queue.clear();
  prev.forEach(([i, p]) => {
    for (const action of i.do) {
      actions[action.action](action as never, nodes.get(`${p.x},${p.y}`)!);
    }
  });
}, 50);

const dirX = (dir: Direction) => ({ right: 1, up: 0, left: -1, down: 0 }[dir]);
const dirY = (dir: Direction) => ({ right: 0, up: -1, left: 0, down: 1 }[dir]);
const capitalize = <T extends string>(s: T): Capitalize<T> =>
  (s[0]!.toUpperCase() + s.slice(1)) as Capitalize<T>;
const rotate = (d: Direction, r: number) => directions[(directions.indexOf(d) + r) % 4]!;

function getRotatedInteraction({ rotation, type }: Node, dir: Direction): Interaction | undefined {
  const interaction = type.on[`knocked${capitalize(rotate(dir, 4 - rotation))}`];
  if (!interaction) return;
  return {
    priority: interaction.priority,
    do: interaction.do.map((action) =>
      "direction" in action ? { ...action, direction: rotate(action.direction, rotation) } : action
    ),
  };
}

export function addNode(
  data: string | { type: NodeType; rotation: Rotation },
  x: number,
  y: number
) {
  if (typeof data === "string") {
    const char = data;
    const type = nodeTypes.find((t) => t.meta.variants.includes(char));
    if (!type) return;
    data = { type, rotation: type.meta.variants.indexOf(char) } as unknown as {
      type: NodeType;
      rotation: Rotation;
    };
    data.rotation = data.type.meta.variants.indexOf(char) as Rotation;
  }
  if (!data || typeof data === "string") return;
  const node = {
    id: crypto.randomUUID(),
    position: { x, y },
    state: "standing",
    ...data,
  } satisfies Node;
  nodes.set(`${x},${y}`, node);
  return true;
}

export const ROWS = process.stdout.rows;
export const COLS = process.stdout.columns;

emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);
process.stdout.write("\x1b[?25l");

export const cursor = { row: Math.ceil(ROWS / 2), col: Math.ceil(COLS / 2), modulus: 1, dir: "h" };
let saveFile: string | undefined;
let isPaused = false;

process.stdin.on("keypress", async (_, key) => {
  if (!key || isPaused) return;

  if (key.ctrl && key.name === "c") {
    process.stdout.write("\x1b[?25h");
    process.exit();
  }

  switch (key.name) {
    case "right":
      cursor.modulus = 1;
      cursor.col = cursor.col + 1;
      cursor.dir = "h";
      break;
    case "up":
      cursor.modulus = -1;
      cursor.row = cursor.row - 1;
      cursor.dir = "v";
      break;
    case "left":
      cursor.modulus = -1;
      cursor.col = cursor.col - 1;
      cursor.dir = "h";
      break;
    case "down":
      cursor.modulus = 1;
      cursor.row = cursor.row + 1;
      cursor.dir = "v";
      break;
    case "return":
      const node = nodes.get(`${cursor.col},${cursor.row}`);
      const dir =
        cursor.dir === "h"
          ? cursor.modulus === 1
            ? "right"
            : "left"
          : cursor.modulus === 1
          ? "down"
          : ("up" as const);

      const interaction = node ? getRotatedInteraction(node, dir) : undefined;
      if (!node || !interaction) break;
      queueInteraction(node.id, interaction, node);
      break;
    case "r":
      for (const n of nodes.values()) {
        n.state = "standing";
      }
      break;
    case "s":
      if (!saveFile) break;
      const data: [number, number, number, Rotation][] = [];
      for (const [_, node] of nodes) {
        data.push([node.type.id, node.position.x, node.position.y, node.rotation]);
      }
      writeFileSync(saveFile, encode(data));
      break;
    case "l":
      if (!saveFile || !existsSync(saveFile)) break;
      try {
        const data = readFileSync(saveFile);
        const decodedData = (saveFile.endsWith("tbit") ? decodeTbit : decode)(data);
        nodes.clear();
        for (const [objectId, x, y, rotation] of decodedData) {
          const type = nodeTypes.find((t) => t.id === objectId) as NodeType;
          if (!type) continue;
          addNode({ type, rotation: (rotation % type.meta.variants.length) as Rotation }, x, y);
        }
      } catch {}
      break;
    case "o":
      isPaused = true;
      const v = await input("", saveFile);
      if (v) saveFile = v;
      isPaused = false;
      break;
    case "backspace":
      cursor.col = cursor.col - 1;
      nodes.delete(`${cursor.col},${cursor.row}`);
      break;
    default: {
      const node = addNode(key.sequence, cursor.col, cursor.row);
      if (node) {
        if (cursor.dir === "h") {
          cursor.col = cursor.col + cursor.modulus;
        } else {
          cursor.row = cursor.row + cursor.modulus;
        }
      }
    }
  }
});

setInterval(render, 17);
