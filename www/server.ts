import express from "express";
import Fingerprint from "express-fingerprint";
import { createClient } from "redis";
import { Project, ProjectData } from "./types";
import { type } from "arktype";

async function main() {
  const redis = createClient({ url: process.env.REDIS_URL });
  await redis.connect();

  const app = express();
  const port = 3000;

  app.use(express.json());
  app.use(Fingerprint());
  app.use((req, res, next) => {
    if (!req.fingerprint) return res.status(401).send("Missing fingerprint");
    next();
  });

  app.get("/api/fp", async (req, res) => {
    res.send(req.fingerprint!.hash);
  });

  app.get("/api/projects", async (_, res) => {
    const keys = await redis.keys("project:*");
    const projects = Project.array().assert(
      keys.length ? (await redis.mGet(keys)).map((v) => JSON.parse((v ?? "") as string)) : []
    );
    res.json(
      projects
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((p) => ({ ...p, data: { ...p.data, data: `/api/projects/${p.id}` } }))
    );
  });

  app.get("/api/projects/:projectId", async (req, res) => {
    const project = await redis.get(`project:${req.params.projectId}`);
    if (!project) return res.status(404);
    res.send(JSON.parse(project).data.data);
  });

  app.put("/api/projects/:projectId", async (req, res) => {
    const parsed = ProjectData.partial()(req.body);
    if (parsed instanceof type.errors) return res.status(400).send(parsed.summary);

    const projectRes = await redis.get(`project:${req.params.projectId}`);
    if (!projectRes) return res.status(404);

    const project = Project.assert(JSON.parse(projectRes));

    if (req.fingerprint!.hash !== project.ownerId) return res.status(403);

    project.name = parsed.name ?? project.name;
    project.data.data = parsed.data ?? project.data.data;

    if (parsed.data) {
      ++project.data.v;
    }

    res.json(project);
  });

  app.post("/api/projects", (req, res) => {
    const parsed = ProjectData(req.body);
    if (parsed instanceof type.errors) return res.status(400).send(parsed.summary);

    const parsedData = parsed.data.split(",").filter(Boolean).map(Number);

    if (!Array.isArray(parsedData) || parsedData.some(isNaN) || parsedData.length % 4 !== 0) {
      return res.status(400).send("Invalid data format");
    }

    const id = crypto.randomUUID();
    const project = Project({
      id,
      name: parsed.name,
      ownerId: req.fingerprint!.hash,
      data: { v: 1, data: parsed.data },
      createdAt: Date.now(),
    });

    redis.set(`project:${id}`, JSON.stringify(project));

    res.json(project);
  });

  app.listen(port, () => {
    console.log(`Express app listening at http://localhost:${port}`);
  });
}

main();
