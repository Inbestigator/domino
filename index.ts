import readline from "node:readline";

const ROWS = process.stdout.rows - 1;
const COLS = process.stdout.columns;
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
  affected: Position[];
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
  if (!affected.some((a) => a.x === n.position.x && a.y === n.position.y) || n.state !== "standing")
    return;
  const xMod = n.char === "\\" && direction === "vertical" ? -modulus : modulus;
  const yMod = n.char === "\\" && direction === "horizontal" ? -modulus : modulus;
  dropDomino(
    {
      affected: [{ x: n.position.x + xMod, y: n.position.y }],
      direction: "horizontal",
      modulus: xMod,
    },
    n
  );
  dropDomino(
    {
      affected: [{ x: n.position.x, y: n.position.y + yMod }],
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
        !affected.some((a) => a.x === n.position.x && a.y === n.position.y) ||
        direction !== "horizontal" ||
        n.state !== "standing"
      )
        return;
      dropDomino(
        {
          affected: [{ x: n.position.x + modulus, y: n.position.y }],
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
        !affected.some((a) => a.y === n.position.y && a.x === n.position.x) ||
        direction !== "vertical" ||
        n.state !== "standing"
      )
        return;
      dropDomino(
        {
          affected: [{ x: n.position.x, y: n.position.y + modulus }],
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
    handleTrigger: (e) => {},
  },
];

const allowedChars = new Set(nodeTypes.map((n) => n.char));

function addNode(char: string, x: number, y: number) {
  if (!allowedChars.has(char)) return;
  const node: Node = {
    position: { x, y },
    char,
    state: "standing",
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

readline.emitKeypressEvents(process.stdin);
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
          affected: [{ x: cursor.col, y: cursor.row }],
          direction: cursor.dir === "h" ? "horizontal" : "vertical",
          modulus: cursor.modulus,
        },
        { char: "", position: { x: -1, y: -1 }, state: "standing" }
      );
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

// Big Spiral™®©
// `|||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||/
// \\|||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||/-
// -\\|||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||/--
// --\\|||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||/---
// ---\\|||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||/----
// ----\\|||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||/-----
// -----\\|||||||||||||||||||||||||||||||||||||||||||||||||||||||||||/------
// ------\\|||||||||||||||||||||||||||||||||||||||||||||||||||||||||/-------
// -------\\|||||||||||||||||||||||||||||||||||||||||||||||||||||||/--------
// --------\\|||||||||||||||||||||||||||||||||||||||||||||||||||||/---------
// ---------\\|||||||||||||||||||||||||||||||||||||||||||||||||||/----------
// ----------\\|||||||||||||||||||||||||||||||||||||||||||||||||/-----------
// -----------\\||||||||||||||||||||||||||||||||||||||||||||||||------------
// -----------/||||||||||||||||||||||||||||||||||||||||||||||||\\-----------
// ----------/||||||||||||||||||||||||||||||||||||||||||||||||||\\----------
// ---------/||||||||||||||||||||||||||||||||||||||||||||||||||||\\---------
// --------/||||||||||||||||||||||||||||||||||||||||||||||||||||||\\--------
// -------/||||||||||||||||||||||||||||||||||||||||||||||||||||||||\\-------
// ------/||||||||||||||||||||||||||||||||||||||||||||||||||||||||||\\------
// -----/||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||\\-----
// ----/||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||\\----
// ---/||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||\\---
// --/||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||\\--
// -/||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||\\-
// /||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||\\`
//   .split("\n")
//   .forEach((r, i) => r.split("").map((v, j) => addNode(v, j, i)));
