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

function triTrigger(
  ...[
    {
      detail: { affected, direction, modulus },
    },
    n,
  ]: Parameters<NodeType["handleTrigger"]>
) {
  if (affected.x !== n.position.x || affected.y !== n.position.y || n.state !== "standing") return;

  const char = n.char;
  const dirs = {
    "^": ["top", "left", "right", "top"],
    v: ["bottom", "left", "right", "bottom"],
    "<": ["top", "bottom", "left", "left"],
    ">": ["top", "bottom", "right", "right"],
  }[char]!;
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
        affected: {
          x: n.position.x + dx,
          y: n.position.y + dy,
        },
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
    handleTrigger: ({ detail: { affected, direction, modulus } }, n) => {
      if (affected.x !== n.position.x || affected.y !== n.position.y || n.state !== "standing") {
        return;
      }
      if (direction !== "horizontal") {
        n.state = "fallen";
        return;
      }
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
      if (affected.x !== n.position.x || affected.y !== n.position.y || n.state !== "standing")
        return;
      if (direction !== "vertical") {
        n.state = "fallen";
        return;
      }
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
  return node;
}

function render() {
  process.stdout.write("\x1b[H");

  for (let y = cursor.row - Math.ceil(ROWS / 2); y < cursor.row + Math.floor(ROWS / 2); y++) {
    let line = "";
    for (let x = cursor.col - Math.ceil(COLS / 2); x < cursor.col + Math.floor(COLS / 2); x++) {
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
        {
          affected: { x: cursor.col, y: cursor.row },
          direction: cursor.dir === "h" ? "horizontal" : "vertical",
          modulus: cursor.modulus,
        },
        { char: "", position: { x: -1, y: -1 }, state: "standing" }
      );
      break;
    case "r":
      for (const n of nodes) {
        n.state = "standing";
      }
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
          nodes.length = 0;
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
      nodes = nodes.filter((n) => n.position.x !== cursor.col || n.position.y !== cursor.row);
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
