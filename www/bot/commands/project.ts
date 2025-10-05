import {
  CommandOption,
  type CommandAutocompleteInteraction,
  type CommandConfig,
  type CommandInteraction,
} from "dressed";
import { decodeTbit } from "../../../tbit-decode";
import { fileURLToPath } from "node:url";
import { Project } from "../../types";
import { type } from "arktype";
import sharp from "sharp";
import path from "node:path";

const TILE_COUNT = 7;
const TILE_SIZE = 64;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const rotatedTiles: Record<number, Buffer[]> = {};

for (let i = 0; i < TILE_COUNT; i++) {
  const file = path.join(__dirname, "..", "..", "public", `${i}.png`);
  rotatedTiles[i] = await Promise.all(
    [0, 90, 180, 270].map((angle) =>
      sharp(file).rotate(angle).resize(TILE_SIZE, TILE_SIZE).toBuffer()
    )
  );
}

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

      const compositeInputs = new Array<{ input: Buffer; top: number; left: number }>();

      for (const [objectId, x, y, rotation] of decoded) {
        const px = (x - minX) * TILE_SIZE;
        const py = (y - minY) * TILE_SIZE;
        compositeInputs.push({
          input: rotatedTiles[objectId]?.[rotation]!,
          top: py,
          left: px,
        });
      }

      const CHUNK_SIZE = 500;

      function composeInChunks(
        baseImage: sharp.Sharp,
        composites: { input: Buffer; top: number; left: number }[]
      ) {
        let composed = baseImage;
        for (let i = 0; i < composites.length; i += CHUNK_SIZE) {
          const chunk = composites.slice(i, i + CHUNK_SIZE);
          composed = composed.composite(chunk);
        }
        return composed;
      }

      const base = sharp({
        create: {
          width,
          height,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
      });

      const finalImage = composeInChunks(base, compositeInputs);
      const buffer = await finalImage.png().toBuffer();

      interaction.editReply({
        attachments: [{ id: 0 }],
        files: [{ data: buffer, name: "decoded.png" }],
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
