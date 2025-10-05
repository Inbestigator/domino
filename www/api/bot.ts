import { handleRequest } from "dressed/server";
// @ts-ignore
import { commands, components, events, config } from "../.dressed";

export const POST = (req: Request) => handleRequest(req, commands, components, events, config);
