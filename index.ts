import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { emitKeypressEvents } from "node:readline";

const ROWS = process.stdout.rows - 1;
const COLS = process.stdout.columns;
const SAVE_FILE = "save.tjs";
let cursor = { row: Math.ceil(ROWS / 2), col: Math.ceil(COLS / 2), modulus: 1, dir: "h" };

interface Position {
  x: number;
  y: number;
}
interface Node {
  position: Position;
  type: NodeType;
  state: "falling" | "fallen" | "standing";
}
interface FallData {
  direction: "horizontal" | "vertical";
  modulus: number;
}
const nodes = new Map<`${number},${number}`, Node>();

async function dropDomino(position: Position, detail: FallData, node: Node) {
  node.state = "falling";
  await new Promise((resolve) => setTimeout(resolve, 50));
  const next = nodes.get(`${position.x},${position.y}`);
  if (next && next.state === "standing") {
    next.type.handleTrigger(detail, next);
  }
  node.state = "fallen";
}

interface NodeType {
  char: string;
  handleTrigger: (e: FallData, n: Node) => void;
}

function diagonalTrigger(...[{ direction, modulus }, n]: Parameters<NodeType["handleTrigger"]>) {
  const xMod = n.type.char === "\\" && direction === "vertical" ? -modulus : modulus;
  const yMod = n.type.char === "\\" && direction === "horizontal" ? -modulus : modulus;
  dropDomino(
    {
      x: n.position.x + xMod,
      y: n.position.y,
    },
    {
      direction: "horizontal",
      modulus: xMod,
    },
    n
  );
  dropDomino(
    { x: n.position.x, y: n.position.y + yMod },
    {
      direction: "vertical",
      modulus: yMod,
    },
    n
  );
}

function triTrigger(...[{ direction, modulus }, n]: Parameters<NodeType["handleTrigger"]>) {
  const dirs = {
    "^": ["top", "left", "right", "top"],
    v: ["bottom", "left", "right", "bottom"],
    "<": ["top", "bottom", "left", "left"],
    ">": ["top", "bottom", "right", "right"],
  }[n.type.char]!;
  const actualDirection =
    direction === "horizontal" ? (modulus > 0 ? "left" : "right") : modulus > 0 ? "top" : "bottom";

  if (!dirs.includes(actualDirection)) return;
  const fallDirs = actualDirection === dirs[3] ? dirs.filter((d) => d !== dirs[3]) : [dirs[3]];

  for (const dir of fallDirs) {
    let dx = 0;
    let dy = 0;
    let d: "horizontal" | "vertical" | undefined;

    switch (dir) {
      case "top":
        dx = 0;
        dy = -1;
        d = "vertical";
        break;
      case "bottom":
        dx = 0;
        dy = 1;
        d = "vertical";
        break;
      case "left":
        dx = -1;
        dy = 0;
        d = "horizontal";
        break;
      case "right":
        dx = 1;
        dy = 0;
        d = "horizontal";
        break;
    }

    if (!d) continue;

    dropDomino(
      {
        x: n.position.x + dx,
        y: n.position.y + dy,
      },
      {
        direction: d,
        modulus: d === "horizontal" ? dx : dy,
      },
      n
    );
  }
}

const nodeTypes: NodeType[] = [
  {
    char: "|",
    handleTrigger: ({ direction, modulus }, n) => {
      if (direction !== "horizontal") {
        n.state = "fallen";
        return;
      }
      dropDomino(
        {
          x: n.position.x + modulus,
          y: n.position.y,
        },
        {
          direction: "horizontal",
          modulus,
        },
        n
      );
    },
  },
  {
    char: "-",
    handleTrigger: ({ direction, modulus }, n) => {
      if (direction !== "vertical") {
        n.state = "fallen";
        return;
      }
      dropDomino(
        {
          x: n.position.x,
          y: n.position.y + modulus,
        },
        {
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
    char: "^",
    handleTrigger: triTrigger,
  },
  {
    char: "v",
    handleTrigger: triTrigger,
  },
  {
    char: ">",
    handleTrigger: triTrigger,
  },
  {
    char: "<",
    handleTrigger: triTrigger,
  },
  {
    char: "+",
    handleTrigger: ({ direction, modulus }, n) => {
      dropDomino(
        direction === "horizontal"
          ? { x: n.position.x + modulus, y: n.position.y }
          : { x: n.position.x, y: n.position.y + modulus },
        {
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
  const type = nodeTypes.find((n) => n.char === char);
  if (!type) return;
  const node: Node = {
    position: { x, y },
    type,
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
          direction: cursor.dir === "h" ? "horizontal" : "vertical",
          modulus: cursor.modulus,
        },
        { type: { char: "", handleTrigger() {} }, position: { x: -1, y: -1 }, state: "standing" }
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
