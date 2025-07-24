import { argMask, parseNodeTypes, resolveEvent } from "./event-resolver";

const directions = ["right", "up", "left", "down"] as const;

type Direction = (typeof directions)[number];
type NodeState = "standing" | "falling" | "fallen" | "unfalling";
export type Rotation = 0 | 1 | 2 | 3;
type Action =
  | ["changeState", NodeState]
  | ["changeRotation", Rotation]
  | ["knock" | "unknock" | "click", Direction]
  | ["fall" | "unfall"];
export type BaseEventKey = "onKnocked" | "onClicked" | "onStart";

export interface Node {
  id: string;
  position: { x: number; y: number };
  type: NodeType;
  state: NodeState;
  rotation: Rotation;
}

export interface Event {
  mask: number;
  maskBits: number;
  actions: Action[];
  priority: number;
  relativeTo: "self" | "world" | "input";
}

export interface NodeType {
  id: number;
  meta: {
    "tjs.characters": string[];
  };
  events: Record<BaseEventKey, Event[]>;
}

export type RawNodeType = Omit<NodeType, "events"> & {
  events: Partial<Record<BaseEventKey | `${BaseEventKey}:${string}`, Partial<Omit<Event, "mask">>>>;
};

export interface QueueEntry {
  node: Node;
  events: Partial<Record<BaseEventKey, number>>;
  event?: Event;
  inverted?: boolean;
}

export const dirX = (dir: Direction) => ({ right: 1, up: 0, left: -1, down: 0 }[dir]);
export const dirY = (dir: Direction) => ({ right: 0, up: -1, left: 0, down: 1 }[dir]);
export const rotate = (d: Direction, r: number) => directions[(directions.indexOf(d) + r) % 4]!;

const invertedActions = {
  fall: "unfall",
  unfall: "fall",
  knock: "unknock",
  unknock: "knock",
  click: "click",
  changeState: "changeState",
  changeRotation: "changeRotation",
} as const;

export default function createInstance(rawNodeTypes: RawNodeType[]) {
  const nodeTypes = parseNodeTypes(rawNodeTypes);
  if (!nodeTypes.every((d) => d.meta["tjs.characters"])) throw new Error("Invalid node type");
  const nodes = new Map<`${number},${number}`, Node>();

  const actions = {
    knock(node: Node, direction: Direction) {
      const x = node.position.x + dirX(direction);
      const y = node.position.y + dirY(direction);
      const next = nodes.get(`${x},${y}`);
      if (!next || next.state !== "standing") return;
      queueEvent(next.id, next, { base: "onKnocked", arg: rotate(direction, 4 - next.rotation) });
    },
    unknock(node: Node, direction: Direction) {
      const x = node.position.x + dirX(direction);
      const y = node.position.y + dirY(direction);
      const next = nodes.get(`${x},${y}`);
      if (!next || next.state !== "fallen") return;
      queueEvent(next.id, next, {
        base: "onKnocked",
        arg: rotate(direction, 4 - next.rotation),
        inverted: true,
      });
    },
    click(node: Node, direction: Direction) {
      const x = node.position.x + dirX(direction);
      const y = node.position.y + dirY(direction);
      const next = nodes.get(`${x},${y}`);
      if (!next) return;
      queueEvent(next.id, next, {
        base: "onClicked",
        arg: rotate(direction, 4 - next.rotation),
      });
    },
    fall(node: Node) {
      actions.changeState(node, "falling");
      queueEvent(crypto.randomUUID(), node, {
        base: "onKnocked",
        event: {
          mask: 0,
          maskBits: 0,
          priority: 0,
          relativeTo: "self",
          actions: [["changeState", "fallen"]],
        },
      });
    },
    unfall(node: Node) {
      actions.changeState(node, "unfalling");
      queueEvent(crypto.randomUUID(), node, {
        base: "onKnocked",
        event: {
          mask: 0,
          maskBits: 0,
          priority: 0,
          relativeTo: "self",
          actions: [["changeState", "standing"]],
        },
      });
    },
    changeState(node: Node, state: NodeState) {
      node.state = state;
    },
    changeRotation(node: Node, rotation: Rotation) {
      node.rotation = ((node.rotation + rotation) %
        node.type.meta["tjs.characters"].length) as Rotation;
    },
  };

  const queue = new Map<string, QueueEntry>();

  function queueEvent(
    id: string,
    node: Node,
    data: { base: BaseEventKey; arg?: Direction; event?: Event; inverted?: boolean }
  ) {
    const events = queue.get(id)?.events ?? {};
    if (data.arg) {
      events[data.base] = argMask([data.arg]) | (events[data.base] ?? 0);
    } else {
      events[data.base] = events[data.base] ?? 0;
    }
    queue.set(id, { ...data, node, events });
  }

  setInterval(() => {
    const prev = new Map(queue);
    queue.clear();
    prev.forEach(({ node, events, event, inverted }) => {
      if (event) {
        return executeEvent(node, event, 0, inverted);
      }
      const resolved = resolveEvent(node.type.events, Object.entries(events));
      if (resolved) {
        executeEvent(node, resolved, resolved.dir, inverted);
      }
    });
  }, 50);

  function executeEvent(node: Node, event: Event, inputDir: number, inverted?: boolean) {
    for (let [key, arg] of event.actions) {
      if (inverted) key = invertedActions[key];
      if (key === "knock" || key === "unknock") {
        arg = rotate(
          arg as never,
          event.relativeTo === "input" ? inputDir : event.relativeTo === "world" ? 0 : node.rotation
        );
      }
      actions[key](node, arg as never);
    }
  }

  function addNode(data: string | { type: NodeType; rotation: Rotation }, x: number, y: number) {
    if (typeof data === "string") {
      const char = data;
      const type = nodeTypes.find((t) => t.meta["tjs.characters"].includes(char));
      if (!type) return;
      data = { type, rotation: type.meta["tjs.characters"].indexOf(char) } as unknown as {
        type: NodeType;
        rotation: Rotation;
      };
      data.rotation = data.type.meta["tjs.characters"].indexOf(char) as Rotation;
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

  return {
    addNode,
    queueEvent,
    executeEvent,
    load(data: [number, number, number, Rotation][]) {
      nodes.clear();
      for (const [objectId, x, y, rotation] of data) {
        const type = nodeTypes.find((t) => t.id === objectId);
        if (!type) continue;
        addNode(
          { type, rotation: (rotation % type.meta["tjs.characters"].length) as Rotation },
          x,
          y
        );
      }
    },
    actions,
    nodes,
    queue,
  };
}
