import { decode } from "./savedata";
import type { Project } from "./types";

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
    const contents = new Uint8Array(await file.arrayBuffer()).toBase64();
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: prompt("Name:"), data: contents }),
    });

    if (!res.ok) throw new Error(`Upload failed: ${res.statusText}`);
    await fetchProjects();
  } catch (err) {
    if (err instanceof Error) {
      errorEl.textContent = `Upload error: ${err.message}`;
    }
  }
});

function base64ToUint8Array(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; ++i) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

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
    const projects = await res.json();

    projects.forEach((project: Project) => {
      const projectDiv = document.createElement("div");
      projectDiv.className = "project";

      const title = document.createElement("h2");
      title.textContent = project.name;
      projectDiv.appendChild(title);

      const decodedData = base64ToUint8Array(project.data.data);
      const decoded = decode(decodedData);

      const TILE_SIZE = 12;
      let minX = Infinity,
        minY = Infinity;
      let maxX = -Infinity,
        maxY = -Infinity;

      for (const [, x, y] of decoded) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }

      const offsetX = -minX;
      const offsetY = -minY;

      const gridContainer = document.createElement("div");
      gridContainer.className = "grid-container";

      const grid = document.createElement("div");
      grid.className = "grid";

      grid.style.width = (maxX - minX + 1) * TILE_SIZE + "px";
      grid.style.height = (maxY - minY + 1) * TILE_SIZE + "px";

      const densityMap = new Map();
      const REGION_SIZE = 100;

      for (const [objectId, x, y, rotation] of decoded) {
        const tile = document.createElement("div");
        tile.className = "tile";
        tile.style.left = `${(x + offsetX) * TILE_SIZE}px`;
        tile.style.top = `${(y + offsetY) * TILE_SIZE}px`;

        const img = document.createElement("img");
        img.src = `/${objectId}.png`;
        img.alt = `Object ${objectId}`;
        img.style.transform = `rotate(${rotation * 90}deg)`;

        tile.appendChild(img);
        grid.appendChild(tile);

        const px = (x + offsetX) * TILE_SIZE;
        const py = (y + offsetY) * TILE_SIZE;
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
        const scrollX = targetCol * REGION_SIZE + REGION_SIZE / 2 - gridContainer.clientWidth / 2;
        const scrollY = targetRow * REGION_SIZE + REGION_SIZE / 2 - gridContainer.clientHeight / 2;
        gridContainer.scrollTo({ left: scrollX, top: scrollY, behavior: "smooth" });
      });

      gridContainer.appendChild(grid);
      projectDiv.appendChild(gridContainer);

      const button = document.createElement("button");
      button.className = "button";
      button.textContent = "Download";
      button.onclick = () => downloadBlob(decodedData, `${project.name}.tbit`);
      projectDiv.appendChild(button);

      container.appendChild(projectDiv);
    });
  } catch (err) {
    if (err instanceof Error) {
      errorEl.textContent = "Error loading projects: " + err.message;
    }
  }
}

fetchProjects();
