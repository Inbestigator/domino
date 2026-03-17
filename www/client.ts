/** biome-ignore-all lint/style/noNonNullAssertion: The elements are present */
import createInstance from "..";
import { dominos } from "../node-types.json";
import { decodeTbit } from "../tbit-decode";

const dropZone = document.getElementById("drop-zone")!;
const errorEl = document.getElementById("error")!;
const container = document.getElementById("project")!;

const TILE_SIZE = 16;
const VIEWPORT_TILE_MARGIN = 2;

let interval: NodeJS.Timeout;

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
  clearInterval(interval);

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

  let viewportX = 0;
  let viewportY = 0;

  function getVisibleBounds() {
    const width = gridContainer.clientWidth;
    const height = gridContainer.clientHeight;

    const startCol = Math.floor(viewportX / TILE_SIZE) - VIEWPORT_TILE_MARGIN;
    const endCol = Math.ceil((viewportX + width) / TILE_SIZE) + VIEWPORT_TILE_MARGIN;
    const startRow = Math.floor(viewportY / TILE_SIZE) - VIEWPORT_TILE_MARGIN;
    const endRow = Math.ceil((viewportY + height) / TILE_SIZE) + VIEWPORT_TILE_MARGIN;

    const offsetX = -minX;
    const offsetY = -minY;

    return { startCol, endCol, startRow, endRow, offsetX, offsetY };
  }

  function renderGrid() {
    const { startCol, endCol, startRow, endRow, offsetX, offsetY } = getVisibleBounds();
    const seen = new Set<string>();

    for (const node of instance.nodes.values()) {
      const x = node.position.x + offsetX;
      const y = node.position.y + offsetY;

      if (x < startCol || x > endCol || y < startRow || y > endRow) continue;

      const key = `${node.position.x},${node.position.y},${node.state},${node.rotation},${node.type.id}`;

      if (lastNodeStates.get(node.id) === key) {
        seen.add(node.id);
        continue;
      }

      lastNodeStates.set(node.id, key);
      seen.add(node.id);

      let tile = nodeElements.get(node.id);
      if (!tile) {
        tile = document.createElement("div");
        tile.className = "tile";
        nodeElements.set(node.id, tile);
        grid.appendChild(tile);
      }

      tile.style.left = `${x * TILE_SIZE}px`;
      tile.style.top = `${y * TILE_SIZE}px`;
      tile.style.cursor = node.type.id === 5 ? "pointer" : "default";
      tile.onclick = node.type.id === 5 ? () => instance.queueEvent(node.id, node, { base: "onClicked" }) : null;

      let img = tile.querySelector("img");
      if (!img) {
        img = document.createElement("img");
        tile.appendChild(img);
      }
      img.src = `/${node.type.id}.png`;
      img.alt = `Object ${node.type.id}`;
      img.style.transform = `rotate(${node.rotation * -90}deg)`;
      img.style.filter = node.state === "fallen" ? "invert(1)" : node.state === "standing" ? "" : "invert(0.5)";
    }

    for (const [id, el] of nodeElements) {
      if (!seen.has(id)) {
        el.remove();
        nodeElements.delete(id);
        lastNodeStates.delete(id);
      }
    }

    grid.style.transform = `translate(${-viewportX}px, ${-viewportY}px)`;
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

  gridContainer.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      viewportX += e.deltaX;
      viewportY += e.deltaY;

      viewportX = Math.max(0, Math.min(viewportX, (maxX - minX + 1) * TILE_SIZE - gridContainer.clientWidth));
      viewportY = Math.max(0, Math.min(viewportY, (maxY - minY + 1) * TILE_SIZE - gridContainer.clientHeight));

      renderGrid();
    },
    { passive: false },
  );
}
