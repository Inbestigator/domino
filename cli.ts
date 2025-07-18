import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { emitKeypressEvents } from "node:readline";
import { decode, encode } from "./savedata";
import { decodeTbit } from "./tbit-decode";
import createInstance, { rotate, type NodeType, type Rotation } from ".";
import { dominos } from "./node-types.json";
import { stdout } from "bun";

export const ROWS = process.stdout.rows;
export const COLS = process.stdout.columns;

emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);
process.stdout.write("\x1b[?25l");

export const cursor = { row: Math.ceil(ROWS / 2), col: Math.ceil(COLS / 2), modulus: 1, dir: "h" };
let saveFile: string | undefined;
let isPaused = false;

function render() {
  if (isPaused) return;
  stdout.write("\x1b[H");
  const stats = `(${cursor.col}, ${cursor.row}) ${instance.nodes.size}`;

  for (let y = cursor.row - Math.ceil(ROWS / 2); y < cursor.row + Math.floor(ROWS / 2); ++y) {
    let line = "";
    for (let x = cursor.col - Math.ceil(COLS / 2); x < cursor.col + Math.floor(COLS / 2); ++x) {
      const node = instance.nodes.get(`${x},${y}`);
      let char = node?.type.meta.characters[node.rotation] ?? " ";
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
      if (y === cursor.row + Math.floor(ROWS / 2) - 1) {
        char = stats[x - cursor.col + Math.ceil(COLS / 2)] ?? char;
      }
      if (isCursor) {
        char = `\x1b[7m${bg}${char}\x1b[0m`;
      } else if (node) {
        char = `${bg}${char}\x1b[0m`;
      }

      line += char;
    }
    stdout.write(line);
  }
}

async function input(prompt: string, initialValue = ""): Promise<string | undefined> {
  isPaused = true;
  let value = initialValue;
  const width = 32;
  const boxTop = Math.floor(ROWS / 2) - 1;
  const boxLeft = Math.floor(COLS / 2) - Math.floor(width / 2);

  const maxInputLength = width - prompt.length - 4;

  stdout.write(`\x1b[${boxTop};${boxLeft}H╭${"─".repeat(width - 2)}╮`);
  stdout.write(`\x1b[${boxTop + 1};${boxLeft}H│${" ".repeat(width - 2)}│`);
  stdout.write(`\x1b[${boxTop + 2};${boxLeft}H╰${"─".repeat(width - 2)}╯`);

  function renderInput() {
    const visible = value.slice(-maxInputLength);
    const padded = visible + " ".repeat(maxInputLength - visible.length);
    stdout.write(`\x1b[${boxTop + 1};${boxLeft + 1}H${prompt} ${padded}`);
  }

  renderInput();

  return new Promise((resolve) => {
    function onKey(str: string, key: { name?: string }) {
      switch (key.name) {
        case "return":
        case "escape":
          isPaused = false;
          process.stdin.off("keypress", onKey);
          resolve(key.name === "return" ? value.trim() : undefined);
          break;
        case "backspace":
          value = value.slice(0, -1);
          break;
        default:
          if (str && str >= " ") {
            value += str;
          }
      }
      renderInput();
    }

    process.stdin.on("keypress", onKey);
  });
}

const instance = createInstance();

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
      const node = instance.nodes.get(`${cursor.col},${cursor.row}`);
      const dir =
        cursor.dir === "h"
          ? cursor.modulus === 1
            ? "right"
            : "left"
          : cursor.modulus === 1
          ? "down"
          : "up";

      if (!node) break;
      instance.queueEvent(node.id, node, `onKnocked:${rotate(dir, 4 - node.rotation)}`);
      instance.queueEvent(node.id, node, "onClicked");
      break;
    case "r":
      for (const n of instance.nodes.values()) {
        n.state = "standing";
      }
      break;
    case "s":
      if (!saveFile) break;
      const data: [number, number, number, Rotation][] = [];
      for (const [_, node] of instance.nodes) {
        data.push([node.type.id, node.position.x, node.position.y, node.rotation]);
      }
      writeFileSync(saveFile, encode(data));
      break;
    case "l":
      if (!saveFile || !existsSync(saveFile)) break;
      try {
        const data = readFileSync(saveFile);
        const decodedData = (saveFile.endsWith("tbit") ? decodeTbit : decode)(data);
        instance.load(decodedData);
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
      instance.nodes.delete(`${cursor.col},${cursor.row}`);
      break;
    case "space":
      for (const n of instance.nodes.values()) {
        if (n.type.id === 3) {
          instance.queueEvent(n.id, n, "onStart");
        }
      }
      break;
    default: {
      const node = instance.addNode(key.sequence, cursor.col, cursor.row);
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
