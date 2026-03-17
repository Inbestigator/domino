/** biome-ignore-all lint/style/noNonNullAssertion: The elements are present */
import createInstance from "..";
import { dominos } from "../node-types.json";
import { decodeTbit } from "../tbit-decode";

const dropZone = document.getElementById("drop-zone")!;
const errorEl = document.getElementById("error")!;
const container = document.getElementById("project")!;

const TILE_SIZE = 12;
const REGION_SIZE = 100;

let interval: NodeJS.Timeout | null = null;

dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.style.background = "#e0e0e0";
});

dropZone.addEventListener("dragleave", () => {
  dropZone.style.background = "";
});

dropZone.addEventListener("drop", async (e) => {
  e.preventDefault();
  dropZone.style.background = "";

  const file = e.dataTransfer?.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    loadProject(file.name, text);
  } catch (err) {
    if (err instanceof Error) {
      errorEl.textContent = `Load error: ${err.message}`;
    }
  }
});

function loadProject(name: string, raw: string) {
  container.replaceChildren();
  if (interval) clearInterval(interval);

  const decoded = decodeTbit(raw);

  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;

  for (const [, x, y] of decoded) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }

  const title = document.createElement("h2");
  title.textContent = name;
  container.appendChild(title);

  const gridContainer = document.createElement("div");
  gridContainer.className = "grid-container";

  const grid = document.createElement("div");
  grid.className = "grid";

  grid.style.width = `${(maxX - minX + 1) * TILE_SIZE}px`;
  grid.style.height = `${(maxY - minY + 1) * TILE_SIZE}px`;

  gridContainer.appendChild(grid);
  container.appendChild(gridContainer);

  const instance = createInstance(dominos as never);

  const nodeElements = new Map<string, HTMLDivElement>();
  const lastNodeStates = new Map<string, string>();
  let hasScrolled = false;

  function renderGrid() {
    const offsetX = -minX;
    const offsetY = -minY;
    const seen = new Set<string>();

    for (const node of instance.nodes.values()) {
      const { id, type, position, state, rotation } = node;
      const key = `${position.x},${position.y},${state},${rotation},${type.id}`;

      if (lastNodeStates.get(id) === key) {
        seen.add(id);
        continue;
      }

      lastNodeStates.set(id, key);
      seen.add(id);

      let tile = nodeElements.get(id);
      if (!tile) {
        tile = document.createElement("div");
        tile.className = "tile";
        nodeElements.set(id, tile);
        grid.appendChild(tile);
      }

      tile.style.left = `${(position.x + offsetX) * TILE_SIZE}px`;
      tile.style.top = `${(position.y + offsetY) * TILE_SIZE}px`;
      tile.style.cursor = type.id === 5 ? "pointer" : "default";
      tile.onclick = type.id === 5 ? () => instance.queueEvent(id, node, { base: "onClicked" }) : null;

      let img = tile.querySelector("img");
      if (!img) {
        img = document.createElement("img");
        tile.appendChild(img);
      }

      img.src = `/${type.id}.png`;
      img.alt = `Object ${type.id}`;
      img.style.transform = `rotate(${rotation * -90}deg)`;
      img.style.filter = state === "fallen" ? "invert(1)" : state === "standing" ? "" : "invert(0.5)";
    }

    for (const [id, el] of nodeElements) {
      if (!seen.has(id)) {
        el.remove();
        nodeElements.delete(id);
        lastNodeStates.delete(id);
      }
    }

    if (!hasScrolled) {
      hasScrolled = true;
      const densityMap = new Map<string, number>();
      for (const node of instance.nodes.values()) {
        const px = (node.position.x + offsetX) * TILE_SIZE;
        const py = (node.position.y + offsetY) * TILE_SIZE;
        const col = Math.floor(px / REGION_SIZE);
        const row = Math.floor(py / REGION_SIZE);
        const key = `${col},${row}`;
        densityMap.set(key, (densityMap.get(key) || 0) + 1);
      }

      let maxCount = -1,
        targetCol = 0,
        targetRow = 0;
      for (const [key, count] of densityMap.entries()) {
        if (count > maxCount) {
          maxCount = count;
          [targetCol, targetRow] = key.split(",").map(Number) as [number, number];
        }
      }

      requestAnimationFrame(() => {
        const scrollX = targetCol * REGION_SIZE + REGION_SIZE / 2 - gridContainer.clientWidth / 2;
        const scrollY = targetRow * REGION_SIZE + REGION_SIZE / 2 - gridContainer.clientHeight / 2;
        gridContainer.scrollTo({
          left: scrollX,
          top: scrollY,
          behavior: "smooth",
        });
      });
    }
  }

  function reload(partial?: boolean) {
    instance.queue.clear();
    if (!partial) instance.load(decoded);

    for (const node of instance.nodes.values()) {
      if (partial) node.state = "standing";
      if (node.type.id === 3) {
        instance.queueEvent(node.id, node, { base: "onStart" });
      }
    }
  }

  reload();
  renderGrid();

  let idleTicks = 0;

  interval = setInterval(() => {
    if (instance.queue.size === 0) {
      if (idleTicks++ >= 20) {
        reload(true);
        renderGrid();
        idleTicks = 0;
      }
    } else {
      idleTicks = 0;
    }

    renderGrid();
  }, 50);
}
