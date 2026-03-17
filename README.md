Domino simulator, CLI version of https://kyowobdev43.itch.io/topplebit made in TS.

The simulator is headless, but you can run it in your terminal with `cli.ts`.

| Key             | Description                                            |
| --------------- | ------------------------------------------------------ |
| Arrow Right     | Move cursor right (+ Shift = 3 cells)                  |
| Arrow Left      | Move cursor left (+ Shift = 3 cells)                   |
| Arrow Up        | Move cursor up (+ Shift = 3 cells)                     |
| Arrow Down      | Move cursor down (+ Shift = 3 cells)                   |
| Enter           | Trigger action on node at cursor (knock + click event) |
| Space           | Start all trigger nodes (triggers `onStart`)           |
| Backspace       | Delete node at current position                        |
| r               | Reset                                                  |
| s               | Save current nodes to file (if a save file is set)     |
| l               | Load nodes from save file (if it exists)               |
| o               | Open prompt to set/save file path                      |
| `\|` `-`        | Place orthogonal domino                                |
| `\` `/`         | Place diagonal domino                                  |
| `<` `>` `^` `v` | Place fork domino                                      |
| `▸` `▴` `◂` `▾` | Place trigger domino                                   |
| `+`             | Place crossover domino                                 |
| `▹` `▵` `◃` `▿` | Place click domino                                     |
