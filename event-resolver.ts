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
    for (const event of node.events) {
      parsedEvents[event.trigger[0]].push({
        actions: event?.actions ?? [],
        priority: event?.priority ?? 0,
        mask: argMask(event.trigger[1] ?? []),
      });
    }
    out.push({ ...node, events: parsedEvents });
  }
  return out;
}

export function resolveEvent(events: NodeType["events"], types: [string, number][]) {
  let best: Event & { dir: number } = {
    priority: -Infinity,
    mask: -1,
    actions: [],
    dir: 0,
  };
  for (const [base, arg] of types) {
    for (const event of events[base as BaseEventKey]) {
      if (
        (event.mask & ~arg) === 0 &&
        (event.priority > best.priority ||
          (event.priority === best.priority && (arg & ~event.mask) < (arg & ~best.mask)))
      ) {
        best = { ...event, dir: Math.log2(arg) };
      }
    }
  }

  return best;
}
