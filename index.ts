import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { emitKeypressEvents } from "node:readline";

const ROWS = process.stdout.rows - 1;
const COLS = process.stdout.columns;
const SAVE_FILE = "save.tjs";
let cursor = { row: 0, col: 0, modulus: 1, dir: "h" };

interface Position {
  x: number;
  y: number;
}
interface Node {
  position: Position;
  char: string;
  state: "falling" | "fallen" | "standing";
}
interface NodeEventDetail {
  affected: Position;
  direction: "horizontal" | "vertical";
  modulus: number;
}
let nodes: Node[] = [];

const dispatcher = new EventTarget();

async function dropDomino(detail: NodeEventDetail, node: Node) {
  node.state = "falling";
  await new Promise((resolve) => setTimeout(resolve, 50));
  dispatcher.dispatchEvent(new CustomEvent<NodeEventDetail>("fall", { detail }));
  node.state = "fallen";
}

interface NodeType {
  char: string;
  handleTrigger: (e: CustomEvent<NodeEventDetail>, n: Node) => void;
}

function diagonalTrigger(
  ...[
    {
      detail: { affected, direction, modulus },
    },
    n,
  ]: Parameters<NodeType["handleTrigger"]>
) {
  if (affected.x !== n.position.x || affected.y !== n.position.y || n.state !== "standing") return;
  const xMod = n.char === "\\" && direction === "vertical" ? -modulus : modulus;
  const yMod = n.char === "\\" && direction === "horizontal" ? -modulus : modulus;
  dropDomino(
    {
      affected: { x: n.position.x + xMod, y: n.position.y },
      direction: "horizontal",
      modulus: xMod,
    },
    n
  );
  dropDomino(
    {
      affected: { x: n.position.x, y: n.position.y + yMod },
      direction: "vertical",
      modulus: yMod,
    },
    n
  );
}

const nodeTypes: NodeType[] = [
  {
    char: "|",
    handleTrigger: ({ detail: { affected, direction, modulus } }, n) => {
      if (
        affected.x !== n.position.x ||
        affected.y !== n.position.y ||
        direction !== "horizontal" ||
        n.state !== "standing"
      )
        return;
      dropDomino(
        {
          affected: { x: n.position.x + modulus, y: n.position.y },
          direction: "horizontal",
          modulus,
        },
        n
      );
    },
  },
  {
    char: "-",
    handleTrigger: ({ detail: { affected, direction, modulus } }, n) => {
      if (
        affected.x !== n.position.x ||
        affected.y !== n.position.y ||
        direction !== "vertical" ||
        n.state !== "standing"
      )
        return;
      dropDomino(
        {
          affected: { x: n.position.x, y: n.position.y + modulus },
          direction: "vertical",
          modulus,
        },
        n
      );
    },
  },
  {
    char: "\\",
    handleTrigger: diagonalTrigger,
  },
  {
    char: "/",
    handleTrigger: diagonalTrigger,
  },
  {
    char: "+",
    handleTrigger: ({ detail: { affected, direction, modulus } }, n) => {
      if (affected.x !== n.position.x || affected.y !== n.position.y || n.state !== "standing")
        return;
      dropDomino(
        {
          affected:
            direction === "horizontal"
              ? { x: n.position.x + modulus, y: n.position.y }
              : { x: n.position.x, y: n.position.y + modulus },
          direction,
          modulus,
        },
        { ...n }
      );
    },
  },
];

const allowedChars = new Set(nodeTypes.map((n) => n.char));

function addNode(char: string, x: number, y: number, state: Node["state"] = "standing") {
  if (!allowedChars.has(char)) return;
  const node: Node = {
    position: { x, y },
    char,
    state,
  };
  nodes = nodes.filter((n) => n.position.x !== node.position.x || n.position.y !== node.position.y);
  nodes.push(node);
  const handler = nodeTypes.find((n) => n.char === char)!.handleTrigger;
  dispatcher.addEventListener("fall", (e) => handler(e as CustomEvent<NodeEventDetail>, node));
}

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val));
}

function render() {
  process.stdout.write("\x1b[H");

  for (let y = 0; y < ROWS; y++) {
    let line = "";
    for (let x = 0; x < COLS; x++) {
      const node = nodes.find((n) => n.position.x === x && n.position.y === y);
      let char = node?.char ?? " ";
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
      cursor.row = clamp(cursor.row - 1, 0, ROWS - 1);
      cursor.modulus = -1;
      cursor.dir = "v";
      break;
    case "down":
      cursor.row = clamp(cursor.row + 1, 0, ROWS - 1);
      cursor.modulus = 1;
      cursor.dir = "v";
      break;
    case "left":
      cursor.modulus = -1;
      cursor.col = clamp(cursor.col - 1, 0, COLS - 1);
      cursor.dir = "h";
      break;
    case "right":
      cursor.modulus = 1;
      cursor.col = clamp(cursor.col + 1, 0, COLS - 1);
      cursor.dir = "h";
      break;
    case "return":
      dropDomino(
        {
          affected: { x: cursor.col, y: cursor.row },
          direction: cursor.dir === "h" ? "horizontal" : "vertical",
          modulus: cursor.modulus,
        },
        { char: "", position: { x: -1, y: -1 }, state: "standing" }
      );
      break;
    case "r":
      nodes = nodes.map((n) => ({ ...n, state: "standing" }));
      break;
    case "s":
      let data = "";
      for (const node of nodes) {
        data += `${node.position.x.toString(36).padStart(2, "0")}${node.position.y
          .toString(36)
          .padStart(2, "0")}${
          node.state === "fallen" ? 2 : node.state === "falling" ? 1 : 0
        }${nodeTypes.findIndex((t) => t.char === node.char)}`;
      }
      writeFileSync(SAVE_FILE, data);
      break;
    case "l":
      if (existsSync(SAVE_FILE)) {
        try {
          const data = readFileSync(SAVE_FILE, "utf-8");
          nodes = [];
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
      cursor.col = clamp(cursor.col - 1, 0, COLS - 1);
      nodes = nodes.filter((n) => n.position.x !== cursor.col || n.position.y !== cursor.row);
      break;
    default: {
      addNode(key.sequence, cursor.col, cursor.row);
      if (cursor.dir === "h") {
        cursor.col = clamp(cursor.col + cursor.modulus, 0, COLS - 1);
      } else {
        cursor.row = clamp(cursor.row + cursor.modulus, 0, ROWS - 1);
      }
    }
  }
});

setInterval(render, 17);
