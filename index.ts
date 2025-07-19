const directions = ["right", "up", "left", "down"] as const;

type Direction = (typeof directions)[number];
type NodeState = "falling" | "fallen" | "standing";
export type Rotation = 0 | 1 | 2 | 3;
type Action =
  | ["changeState" | "changeRotation" | "knock" | "unknock" | "fall" | "stand", (string | number)?];
type BaseEventKey = "onKnocked" | "onClicked" | "onStart";

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

export interface NodeType {
  id: number;
  meta: {
    "tjs.characters": string[];
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
  inverted?: boolean;
}

export const dirX = (dir: Direction) => ({ right: 1, up: 0, left: -1, down: 0 }[dir]);
export const dirY = (dir: Direction) => ({ right: 0, up: -1, left: 0, down: 1 }[dir]);
export const rotate = (d: Direction, r: number) => directions[(directions.indexOf(d) + r) % 4]!;

const invertedActions = {
  fall: "stand",
  stand: "fall",
  knock: "unknock",
  unknock: "knock",
  changeState: "changeState",
  changeRotation: "changeRotation",
} as const;

export default function createInstance(dominos: NodeType[]) {
  if (!dominos.every((d) => d.meta["tjs.characters"])) throw new Error("Invalid domino node");
  const nodes = new Map<`${number},${number}`, Node>();

  const actions = {
    knock(node: Node, direction: Direction) {
      const x = node.position.x + dirX(direction);
      const y = node.position.y + dirY(direction);
      const next = nodes.get(`${x},${y}`);
      if (!next || next.state !== "standing") return;
      queueEvent(next.id, next, `onKnocked:${rotate(direction, 4 - next.rotation)}`);
    },
    unknock(node: Node, direction: Direction) {
      const x = node.position.x + dirX(direction);
      const y = node.position.y + dirY(direction);
      const next = nodes.get(`${x},${y}`);
      if (!next || next.state !== "fallen") return;
      queueEvent(next.id, next, `onKnocked:${rotate(direction, 4 - next.rotation)}`, {
        inverted: true,
      });
    },
    fall(node: Node) {
      actions.changeState(node, "falling");
      queueEvent(crypto.randomUUID(), node, "" as never, {
        event: {
          actions: [["changeState", "fallen"]],
        },
      });
    },
    stand(node: Node) {
      actions.changeState(node, "falling");
      queueEvent(crypto.randomUUID(), node, "" as never, {
        event: {
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
    key: BaseEventKey | `${BaseEventKey}:${string}`,
    data: { event?: Event; inverted?: boolean } = {}
  ) {
    const parts = queue.get(id)?.parts ?? {};
    const [base, arg] = key.split(":") as [BaseEventKey, string];
    if (!parts[base]) parts[base] = [];
    parts[base]?.push(arg);
    queue.set(id, { node, parts, ...data });
  }

  setInterval(() => {
    const prev = new Map(queue);
    queue.clear();
    prev.forEach(({ node, parts, event, inverted }) => {
      if (event) {
        return executeEvent(node, event, undefined, inverted);
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
        executeEvent(node, best.event, best.dir, inverted);
      }
    });
  }, 50);

  function executeEvent(
    node: Node,
    event: Event,
    inputDir: Direction = "right",
    inverted?: boolean
  ) {
    for (const action of event.actions) {
      let [key, arg] = action;
      if (inverted) key = invertedActions[key];
      if (["knock", "unknock"].includes(key)) {
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

  function addNode(data: string | { type: NodeType; rotation: Rotation }, x: number, y: number) {
    if (typeof data === "string") {
      const char = data;
      const type = dominos.find((t) => t.meta["tjs.characters"].includes(char));
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
        const type = dominos.find((t) => t.id === objectId);
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
