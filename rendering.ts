import { COLS, cursor, nodes, ROWS } from ".";

let isPaused = false;

export function render() {
  if (isPaused) return;
  process.stdout.write("\x1b[H");
  const stats = `(${cursor.col}, ${cursor.row}) ${nodes.size}`;

  for (let y = cursor.row - Math.ceil(ROWS / 2); y < cursor.row + Math.floor(ROWS / 2); ++y) {
    let line = "";
    for (let x = cursor.col - Math.ceil(COLS / 2); x < cursor.col + Math.floor(COLS / 2); ++x) {
      const node = nodes.get(`${x},${y}`);
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
    process.stdout.write(line);
  }
}

export async function input(prompt: string, initialValue = ""): Promise<string | undefined> {
  isPaused = true;
  let value = initialValue;
  const width = 32;
  const boxTop = Math.floor(ROWS / 2) - 1;
  const boxLeft = Math.floor(COLS / 2) - Math.floor(width / 2);

  const maxInputLength = width - prompt.length - 4;

  process.stdout.write(`\x1b[${boxTop};${boxLeft}H╭${"─".repeat(width - 2)}╮`);
  process.stdout.write(`\x1b[${boxTop + 1};${boxLeft}H│${" ".repeat(width - 2)}│`);
  process.stdout.write(`\x1b[${boxTop + 2};${boxLeft}H╰${"─".repeat(width - 2)}╯`);

  function renderInput() {
    const visible = value.slice(-maxInputLength);
    const padded = visible + " ".repeat(maxInputLength - visible.length);
    process.stdout.write(`\x1b[${boxTop + 1};${boxLeft + 1}H${prompt} ${padded}`);
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
