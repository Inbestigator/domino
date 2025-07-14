import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { emitKeypressEvents } from "node:readline";
import nodeTypes from "./node-types.json";

const ROWS = process.stdout.rows - 1;
const COLS = process.stdout.columns;
const SAVE_FILE = "save.tjs";
const cursor = { row: Math.ceil(ROWS / 2), col: Math.ceil(COLS / 2), modulus: 1, dir: "h" };

interface Position {
  x: number;
  y: number;
}
interface Node {
  position: Position;
  type: NodeType;
  state: "falling" | "fallen" | "standing";
}

interface NodeType {
  char: string;
  interactions: {
    in: { x: -1 | 0 | 1; y: -1 | 0 | 1 };
    out: { x: -1 | 0 | 1; y: -1 | 0 | 1; fall?: false }[];
  }[];
}

const nodes = new Map<`${number},${number}`, Node>();

async function dropDomino(position: Position, node: Node) {
  node.state = "falling";
  await new Promise((resolve) => setTimeout(resolve, 50));
  const next = nodes.get(`${position.x},${position.y}`);
  if (next && next.state === "standing") {
    const interaction = next.type.interactions.find(
      (i) => i.in.x === node.position.x - position.x && i.in.y === node.position.y - position.y
    );
    if (interaction) {
      for (const out of interaction.out) {
        dropDomino(
          { x: out.x + next.position.x, y: out.y + next.position.y },
          out.fall === false ? { ...next } : next
        );
      }
    }
  }
  node.state = "fallen";
}

const allowedChars = new Set(nodeTypes.map((n) => n.char));

function addNode(char: string, x: number, y: number, state: Node["state"] = "standing") {
  if (!allowedChars.has(char)) return;
  const type = nodeTypes.find((n) => n.char === char);
  if (!type) return;
  const node: Node = {
    position: { x, y },
    type: type as NodeType,
    state,
  };
  nodes.set(`${x},${y}`, node);
  return node;
}

function render() {
  process.stdout.write("\x1b[H");

  for (let y = cursor.row - Math.ceil(ROWS / 2); y < cursor.row + Math.floor(ROWS / 2); y++) {
    let line = "";
    for (let x = cursor.col - Math.ceil(COLS / 2); x < cursor.col + Math.floor(COLS / 2); x++) {
      const node = nodes.get(`${x},${y}`);
      let char = node?.type.char ?? " ";
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
    process.stdout.write(line + "\n");
  }
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
      dropDomino(
        { x: cursor.col, y: cursor.row },
        {
          type: { char: "", interactions: [] },
          position: {
            x: cursor.dir === "h" ? cursor.col - cursor.modulus : cursor.col,
            y: cursor.dir === "v" ? cursor.row - cursor.modulus : cursor.row,
          },
          state: "standing",
        }
      );
      break;
    case "r":
      for (const n of nodes.values()) {
        n.state = "standing";
      }
      break;
    case "s":
      let data = "";
      for (const node of nodes.values()) {
        data += `${node.position.x.toString(36).padStart(2, "0")}${node.position.y
          .toString(36)
          .padStart(2, "0")}${
          node.state === "fallen" ? 2 : node.state === "falling" ? 1 : 0
        }${nodeTypes.findIndex((t) => t.char === node.type.char)}`;
      }
      writeFileSync(SAVE_FILE, data);
      break;
    case "l":
      if (existsSync(SAVE_FILE)) {
        try {
          const data = readFileSync(SAVE_FILE, "utf-8");
          nodes.clear();
          for (let i = 0; i < data.length; i += 6) {
            const x = parseInt(data.slice(i, i + 2), 36);
            const y = parseInt(data.slice(i + 2, i + 4), 36);
            const stateCode = parseInt(data[i + 4]!);
            const charIndex = parseInt(data[i + 5]!);
            const { char } = nodeTypes[charIndex]!;
            const state = stateCode === 2 ? "fallen" : stateCode === 1 ? "falling" : "standing";

            addNode(char, x, y, state);
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
