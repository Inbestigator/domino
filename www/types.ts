import { type } from "arktype";

export const Project = type({
  id: "string",
  name: "string",
  ownerId: "string",
  data: { v: "number", data: "string" },
  createdAt: "number",
});

export const ProjectData = type({
  name: "string",
  data: "string",
});
