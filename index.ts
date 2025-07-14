import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { emitKeypressEvents } from "node:readline";
import nodeTypes from "./node-types.json";
import { decode, encode } from "./savedata";

const ROWS = process.stdout.rows;
const COLS = process.stdout.columns;
const SAVE_FILE = "save.tjs";
const cursor = { row: Math.ceil(ROWS / 2), col: Math.ceil(COLS / 2), modulus: 1, dir: "h" };

type Direction = "up" | "right" | "down" | "left";
type Action = "fall";
export type Rotation = 0 | 1 | 2 | 3;

interface Position {
  x: number;
  y: number;
}
interface Node {
  position: Position;
  type: NodeType;
  state: "falling" | "fallen" | "standing";
  rotation: Rotation;
}

interface Interaction {
  trigger: Direction[];
  actions: Action[];
}

interface NodeType {
  id: number;
  meta: {
    variants: string[];
  };
  interactions: {
    up?: Interaction;
    right?: Interaction;
    down?: Interaction;
    left?: Interaction;
  };
}

const nodes = new Map<`${number},${number}`, Node>();

async function dropDomino(position: Position, node: Node) {
  node.state = "falling";
  await new Promise((resolve) => setTimeout(resolve, 50));
  const next = nodes.get(`${position.x},${position.y}`);
  if (next && next.state === "standing") {
    const direction: Direction =
      node.position.y < position.y
        ? "up"
        : node.position.x > position.x
        ? "right"
        : node.position.y > position.y
        ? "down"
        : "left";
    const interaction = next.type.interactions[direction];
    if (interaction) {
      for (const out of interaction.trigger) {
        const outX = out === "right" ? 1 : out === "left" ? -1 : 0;
        const outY = out === "up" ? -1 : out === "down" ? 1 : 0;
        dropDomino(
          { x: outX + next.position.x, y: outY + next.position.y },
          interaction.actions.includes("fall") ? next : { ...next }
        );
      }
    }
  }
  node.state = "fallen";
}

const directionOrder = ["up", "right", "down", "left"] as const;

function rotateDirection(dir: Direction, rotation: Rotation): Direction {
  const index = directionOrder.indexOf(dir);
  return directionOrder[(index + rotation) % 4]!;
}

function rotate(interactions: NodeType["interactions"], rotation: Rotation) {
  const rotated = { ...interactions };

  for (const from of directionOrder) {
    const original = interactions[from];
    if (!original) continue;

    const to = rotateDirection(from, rotation);
    rotated[to] = {
      trigger: original.trigger.map((t) => rotateDirection(t, rotation)),
      actions: original.actions,
    };
  }

  return rotated;
}

function addNode(data: string | { type: NodeType; rotation: Rotation }, x: number, y: number) {
  if (typeof data === "string") {
    const char = data;
    data = { type: nodeTypes.find((t) => t.meta.variants.includes(char)) } as {
      type: NodeType;
      rotation: Rotation;
    };
    data.rotation = data.type.meta.variants.indexOf(char) as Rotation;
  }
  if (!data || typeof data === "string") return;
  const transFormedInteractions = rotate(data.type.interactions, data.rotation);
  nodes.set(`${x},${y}`, {
    position: { x, y },
    state: "standing",
    rotation: data.rotation,
    type: { ...data.type, interactions: transFormedInteractions },
  });
  return true;
}

function render() {
  process.stdout.write("\x1b[H");

  for (let y = cursor.row - Math.ceil(ROWS / 2); y < cursor.row + Math.floor(ROWS / 2); y++) {
    let line = "";
    for (let x = cursor.col - Math.ceil(COLS / 2); x < cursor.col + Math.floor(COLS / 2); x++) {
      const node = nodes.get(`${x},${y}`);
      let char = node?.type.meta.variants[node.rotation] ?? " ";
      let bg = "";

      if (node) {
        switch (node.state) {
          case "standing":
            bg = "\x1b[44m";
            break;
          case "falling":
            bg = "\x1b[42m";
            break;
          case "fallen":
            bg = "\x1b[41m";
            break;
        }
      }

      const isCursor = cursor.col === x && cursor.row === y;
      if (isCursor) {
        char = `\x1b[7m${bg}${char}\x1b[0m`;
      } else if (node) {
        char = `${bg}${char}\x1b[0m`;
      }

      line += char;
    }
    process.stdout.write(line);
  }
  process.stdout.write(`\x1b[${ROWS};1H(${cursor.col}, ${cursor.row}) ${nodes.size}`);
}

emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);
process.stdout.write("\x1b[?25l");

process.stdin.on("keypress", (_, key) => {
  if (!key) return;

  if (key.ctrl && key.name === "c") {
    process.stdout.write("\x1b[?25h");
    process.exit();
  }

  switch (key.name) {
    case "up":
      cursor.modulus = -1;
      cursor.row = cursor.row - 1;
      cursor.dir = "v";
      break;
    case "down":
      cursor.modulus = 1;
      cursor.row = cursor.row + 1;
      cursor.dir = "v";
      break;
    case "left":
      cursor.modulus = -1;
      cursor.col = cursor.col - 1;
      cursor.dir = "h";
      break;
    case "right":
      cursor.modulus = 1;
      cursor.col = cursor.col + 1;
      cursor.dir = "h";
      break;
    case "return":
      dropDomino({ x: cursor.col, y: cursor.row }, {
        position: {
          x: cursor.dir === "h" ? cursor.col - cursor.modulus : cursor.col,
          y: cursor.dir === "v" ? cursor.row - cursor.modulus : cursor.row,
        },
        state: "standing",
      } as Node);
      break;
    case "r":
      for (const n of nodes.values()) {
        n.state = "standing";
      }
      break;
    case "s":
      const data: [number, number, number, Rotation][] = [];
      for (const [_, node] of nodes) {
        data.push([node.type.id, node.position.x, node.position.y, node.rotation]);
      }
      writeFileSync(SAVE_FILE, encode(data));
      break;
    case "l":
      if (existsSync(SAVE_FILE)) {
        try {
          const data = readFileSync(SAVE_FILE);
          const decodedData = decode(data);
          nodes.clear();
          for (const [objectId, x, y, rotation] of decodedData) {
            addNode({ type: nodeTypes.find((t) => t.id === objectId) as NodeType, rotation }, x, y);
          }
        } catch {}
      }
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
