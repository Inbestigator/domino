import express from "express";
import Fingerprint from "express-fingerprint";
import { createClient } from "redis";
import type { Project } from "../types";

async function main() {
  const redis = createClient({ url: process.env.REDIS_URL });
  await redis.connect();

  const app = express();
  const port = 3000;

  app.use(express.json());
  app.use(Fingerprint());

  app.get("/api/projects", async (_, res) => {
    const keys = await redis.keys("project:*");
    const projects = keys.length
      ? (await redis.mGet(keys)).map((v) => JSON.parse((v ?? "") as string))
      : [];
    res.json(projects);
  });

  app.post("/api/projects", (req, res) => {
    const { fingerprint } = req;
    let { name, data } = req.body;

    if (!fingerprint || !name) {
      return res.status(400).json({ error: "Missing fingerprint or project name." });
    }

    const id = crypto.randomUUID();
    const parsed = data.split(",").filter(Boolean).map(Number);

    if (!Array.isArray(parsed) || parsed.some(isNaN) || parsed.length % 4 !== 0) {
      res.status(400).send("Invalid format");
      return;
    }

    redis.set(
      `project:${id}`,
      JSON.stringify({
        id,
        name,
        ownerId: fingerprint.hash,
        data: { v: 1, data },
        createdAt: Date.now(),
      } satisfies Project)
    );

    res.status(201).json({ message: "Project added", id });
  });

  app.listen(port, () => {
    console.log(`Express app listening at http://localhost:${port}`);
  });
}

main();
