import { dominos } from "../node-types.json";
import { decodeTbit } from "../tbit-decode";
import type { Project } from "./types";
import createInstance from "..";

const dropZone = document.getElementById("drop-zone")!;
const errorEl = document.getElementById("error")!;

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
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: prompt("Name:"), data: await file.text() }),
    });

    if (!res.ok) throw new Error(`Upload failed: ${res.statusText}`);
    await fetchProjects();
  } catch (err) {
    if (err instanceof Error) {
      errorEl.textContent = `Upload error: ${err.message}`;
    }
  }
});

function downloadBlob(data: Uint8Array<ArrayBuffer>, name: string) {
  const blob = new Blob([data], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function fetchProjects() {
  const container = document.getElementById("projects-container");
  if (!container) return;
  container.replaceChildren();

  try {
    const res = await fetch("/api/projects");
    if (!res.ok) throw new Error(`Failed to fetch: ${res.statusText}`);
    const projects = (await res.json()) as Project[];

    for (const project of projects) {
      const projectDiv = document.createElement("div");
      projectDiv.className = "project";

      const title = document.createElement("h2");
      title.textContent = project.name;
      projectDiv.appendChild(title);

      const gridContainer = document.createElement("div");
      gridContainer.className = "grid-container";

      const grid = document.createElement("div");
      grid.className = "grid";

      gridContainer.appendChild(grid);
      projectDiv.appendChild(gridContainer);

      const button = document.createElement("a");
      button.className = "button";
      button.textContent = "Download";
      button.href = project.data.data;
      button.download = `${project.name}.tbit`;
      projectDiv.appendChild(button);

      container.appendChild(projectDiv);

      const TILE_SIZE = 12;
      const REGION_SIZE = 100;

      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;

      const instance = createInstance(dominos as never);

      let hasScrolled = false;
      const nodeElements = new Map<string, HTMLDivElement>();
      let lastNodeStates = new Map<string, string>();

      function renderGrid() {
        const offsetX = -minX;
        const offsetY = -minY;
        const seen = new Set<string>();
        for (const node of instance.nodes.values()) {
          const {
            id,
            type: { id: objectId },
            position: { x, y },
            state,
            rotation,
          } = node;

          const key = `${x},${y},${state},${rotation},${objectId}`;
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

          tile.style.left = `${(x + offsetX) * TILE_SIZE}px`;
          tile.style.top = `${(y + offsetY) * TILE_SIZE}px`;
          tile.style.cursor = objectId === 5 ? "pointer" : "default";
          tile.onclick = objectId === 5 ? () => instance.queueEvent(id, node, "onClicked") : null;

          let img = tile.querySelector("img") as HTMLImageElement | null;
          if (!img) {
            img = document.createElement("img");
            tile.appendChild(img);
          }

          img.src = `/${objectId}.png`;
          img.alt = `Object ${objectId}`;
          img.style.transform = `rotate(${rotation * -90}deg)`;
          img.style.filter =
            state === "fallen" ? "invert(1)" : state === "standing" ? "" : "invert(0.5)";
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
          const densityMap = new Map();
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
              [targetCol, targetRow] = key.split(",").map(Number);
            }
          }

          requestAnimationFrame(() => {
            const scrollX =
              targetCol * REGION_SIZE + REGION_SIZE / 2 - gridContainer.clientWidth / 2;
            const scrollY =
              targetRow * REGION_SIZE + REGION_SIZE / 2 - gridContainer.clientHeight / 2;
            gridContainer.scrollTo({ left: scrollX, top: scrollY, behavior: "smooth" });
          });
        }
      }

      async function fetchProject() {
        const res = await fetch(project.data.data);
        if (!res.ok) throw new Error(`Failed to fetch tbit data: ${res.statusText}`);
        const decoded = decodeTbit(await res.text());
        for (const [, x, y] of decoded) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }

        grid.style.width = (maxX - minX + 1) * TILE_SIZE + "px";
        grid.style.height = (maxY - minY + 1) * TILE_SIZE + "px";

        function reload() {
          instance.load(decoded);
          for (const node of instance.nodes.values()) {
            if (node.type.id === 3) {
              instance.queueEvent(node.id, node, "onStart");
            }
          }
        }

        reload();
        renderGrid();
        let idleTicks = 0;

        setInterval(() => {
          renderGrid();
          if (instance.queue.size === 0) {
            ++idleTicks;
            if (idleTicks >= 20) {
              idleTicks = 0;
              reload();
            }
          } else {
            idleTicks = 0;
          }
        }, 50);
      }
      fetchProject();
    }
  } catch (err) {
    if (err instanceof Error) {
      errorEl.textContent = "Error loading projects: " + err.message;
    }
  }
}

fetchProjects();
