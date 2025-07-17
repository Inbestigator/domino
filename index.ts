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
type Action = ["changeState", NodeState] | ["knock", Direction] | "fall";
type BaseEventKey = "onKnocked" | "onClicked";

export interface Node {
  id: string;
  position: { x: number; y: number };
  type: NodeType;
  state: NodeState;
  rotation: Rotation;
}

export interface Event {
  actions: Action[];
  priority?: number;
  relativeTo?: "self" | "world" | "input";
}

interface NodeType {
  id: number;
  meta: {
    variants: string[];
  };
  events: {
    [K in BaseEventKey]?: Event;
  } & {
    [key: `${BaseEventKey}:${string}`]: Event;
  };
}

export interface QueueEntry {
  node: Node;
  parts: Partial<Record<BaseEventKey, string[]>>;
  event?: Event;
}

export const nodes = new Map<`${number},${number}`, Node>();

const actions = {
  knock(node: Node, direction: Direction) {
    const x = node.position.x + dirX(direction);
    const y = node.position.y + dirY(direction);
    const next = nodes.get(`${x},${y}`);
    if (!next || next.state !== "standing") return;
    queueEvent(next.id, next, { base: "onKnocked", arg: rotate(direction, 4 - next.rotation) });
  },
  fall(node: Node) {
    actions.changeState(node, "falling");
    queueEvent(crypto.randomUUID(), node, {} as never, {
      actions: [["changeState", "fallen"]],
    });
  },
  changeState(node: Node, state: NodeState) {
    node.state = state;
  },
};

const queue = new Map<string, QueueEntry>();

function queueEvent(
  key: string,
  node: Node,
  part: { base: BaseEventKey; arg: string },
  event?: Event
) {
  const parts = queue.get(key)?.parts ?? {};
  if (!parts[part.base]) parts[part.base] = [];
  parts[part.base]?.push(part.arg);
  queue.set(key, { node, parts, event });
}

setInterval(() => {
  const prev = new Map(queue);
  queue.clear();
  prev.forEach(({ node, parts, event }, key) => {
    if (event) {
      return executeEvent(node, event);
    }
    const events = Object.entries(node.type.events).sort(
      (a, b) => (a[1].priority ?? 0) - (b[1].priority ?? 0)
    );
    let best: { event: Event; dir?: Direction; priority: number; argLen: number } | undefined;
    for (const [key, event] of events) {
      const [base, ...args] = key.split(/[:,]/) as [BaseEventKey, ...string[]];
      const part = parts[base];
      if (!part) continue;
      const priority = event.priority ?? 0;
      const presentArgs = args.filter((arg) => part.includes(arg));

      if (
        !best ||
        (presentArgs.length === args.length &&
          (priority > best.priority ||
            (priority === best.priority && presentArgs.length > best.argLen)))
      ) {
        best = { event, dir: part[0] as Direction, argLen: presentArgs.length, priority };
      }
    }
    if (best) {
      executeEvent(node, best.event, best.dir);
    }
  });
}, 50);

function executeEvent(node: Node, event: Event, inputDir: Direction = "right") {
  for (const action of event.actions) {
    if (typeof action === "string") {
      actions[action](node);
      return;
    }
    let [key, arg] = action;
    if (key === "knock") {
      arg = rotate(
        arg as never,
        event.relativeTo === "input"
          ? directions.indexOf(inputDir)
          : event.relativeTo === "world"
          ? 0
          : node.rotation
      );
    }
    actions[key](node, arg as never);
  }
}

const dirX = (dir: Direction) => ({ right: 1, up: 0, left: -1, down: 0 }[dir]);
const dirY = (dir: Direction) => ({ right: 0, up: -1, left: 0, down: 1 }[dir]);
const rotate = (d: Direction, r: number) => directions[(directions.indexOf(d) + r) % 4]!;

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
      cursor.col = cursor.col + (key.shift ? 3 : 1);
      cursor.dir = "h";
      break;
    case "up":
      cursor.modulus = -1;
      cursor.row = cursor.row - (key.shift ? 3 : 1);
      cursor.dir = "v";
      break;
    case "left":
      cursor.modulus = -1;
      cursor.col = cursor.col - (key.shift ? 3 : 1);
      cursor.dir = "h";
      break;
    case "down":
      cursor.modulus = 1;
      cursor.row = cursor.row + (key.shift ? 3 : 1);
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
          : "up";

      if (!node) break;
      queueEvent(node.id, node, { base: "onKnocked", arg: rotate(dir, 4 - node.rotation) });
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
