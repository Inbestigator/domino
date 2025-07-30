import {
  CommandOption,
  type CommandAutocompleteInteraction,
  type CommandConfig,
  type CommandInteraction,
} from "dressed";
import { decodeTbit } from "../../../tbit-decode";
import { createCanvas, loadImage } from "canvas";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Project } from "../../types";
import { type } from "arktype";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const config: CommandConfig = {
  description: "Interface with projects on tbit.vercel.app",
  options: [
    CommandOption({
      type: "Subcommand",
      name: "upload",
      description: "Create a new project",
      options: [
        CommandOption({
          type: "String",
          name: "name",
          description: "The project name",
          required: true,
        }),
        CommandOption({
          type: "Attachment",
          name: "file",
          description: "The .tbit project file",
          required: true,
        }),
      ],
    }),
    CommandOption({
      type: "Subcommand",
      name: "get",
      description: "Get a project",
      options: [
        CommandOption({
          type: "String",
          name: "id",
          description: "The id of the project to get",
          required: true,
          autocomplete: true,
        }),
      ],
    }),
  ],
};

export async function autocomplete(interaction: CommandAutocompleteInteraction) {
  const res = await fetch("https://tbit.vercel.app/api/projects");
  if (!res.ok) throw new Error(`Failed to fetch: ${res.statusText}`);
  const projects = Project.array()(await res.json());
  if (projects instanceof type.errors) return;
  return interaction.sendChoices(projects.map((p) => ({ name: p.name, value: p.id })));
}

export default async function projectCommand(interaction: CommandInteraction) {
  await interaction.deferReply({ ephemeral: true });
  const subcommand =
    interaction.getOption("get")?.subcommand() ?? interaction.getOption("upload")?.subcommand();

  switch (subcommand?.name) {
    case "get": {
      const id = subcommand.getOption("id", true).string();
      const res = await fetch(`https://tbit.vercel.app/api/projects/${id}`);
      if (!res.ok) {
        return interaction.editReply("### Failed to get project!");
      }
      const decoded = decodeTbit(await res.text());
      const positions = decoded.map(([_, x, y]) => [x, y]);
      const minX = Math.min(...positions.map((p) => p[0]!));
      const minY = Math.min(...positions.map((p) => p[1]!));
      const maxX = Math.max(...positions.map((p) => p[0]!));
      const maxY = Math.max(...positions.map((p) => p[1]!));

      const tileSize = 64;
      const width = (maxX - minX + 1) * tileSize;
      const height = (maxY - minY + 1) * tileSize;

      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext("2d");

      const tiles = await Promise.all(
        Array(7)
          .fill(0)
          .map((_, i) => loadImage(path.join(__dirname, "..", "..", "public", `${i}.png`)))
      );

      for (const [objectId, x, y, rotation] of decoded) {
        try {
          ctx.save();
          const drawX = (x - minX) * tileSize;
          const drawY = (y - minY) * tileSize;

          ctx.translate(drawX + tileSize / 2, drawY + tileSize / 2);
          ctx.rotate(((rotation % 4) * Math.PI) / 2);
          ctx.drawImage(tiles[objectId]!, -tileSize / 2, -tileSize / 2, tileSize, tileSize);
          ctx.restore();
        } catch (err) {
          console.error(`Failed to load ${objectId}.png:`, err);
        }
      }

      // Get image buffer
      const image = canvas.toBuffer("image/png");
      interaction.editReply({
        attachments: [{ id: 0, filename: "decoded.png" }],
        files: [{ data: image, name: "decoded.png" }],
      });
      break;
    }
    case "upload": {
      const file = subcommand.getOption("file", true).attachment();
      const name = subcommand.getOption("name", true).string();

      const fileRes = await fetch(file.url);
      const res = await fetch("https://tbit.vercel.app/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, data: await fileRes.text() }),
      });
      if (!res.ok) {
        return interaction.editReply(`### Failed to upload project!\n> ${await res.text()}`);
      }
      interaction.editReply("Done");
    }
  }
}
