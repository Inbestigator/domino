import type { NodeType, RawNodeType, Event, BaseEventKey } from ".";

const ARG_MASK = {
  right: 1 << 0,
  up: 1 << 1,
  left: 1 << 2,
  down: 1 << 3,
};

export function argMask(args: (keyof typeof ARG_MASK)[]) {
  return args.reduce((p, a) => ARG_MASK[a] | p, 0);
}

export function parseNodeTypes(nodes: RawNodeType[]) {
  const out: NodeType[] = [];
  for (const node of nodes) {
    const parsedEvents: Record<BaseEventKey, Event[]> = {
      onClicked: [],
      onKnocked: [],
      onStart: [],
    };
    for (const key in node.events) {
      const [base, ...args] = key.split(/[:,]/) as [BaseEventKey, ...(keyof typeof ARG_MASK)[]];
      const event = node.events[key as BaseEventKey];
      parsedEvents[base].push({
        actions: event?.actions ?? [],
        priority: event?.priority ?? 0,
        relativeTo: event?.relativeTo ?? "self",
        mask: argMask(args),
        maskBits: args.length,
      });
    }
    out.push({ ...node, events: parsedEvents });
  }
  return out;
}

export function resolveEvent(events: NodeType["events"], types: [string, number][]) {
  let best: Event & { dir: number } = {
    priority: -Infinity,
    maskBits: -Infinity,
    mask: -1,
    actions: [],
    relativeTo: "self",
    dir: 0,
  };
  for (const [base, arg] of types) {
    for (const event of events[base as BaseEventKey]) {
      if (
        (event.mask === 0 || arg === event.mask) &&
        (event.priority > best.priority ||
          (event.priority === best.priority && event.maskBits > best.maskBits))
      ) {
        best = { ...event, dir: Math.log2(arg) };
      }
    }
  }

  return best;
}
