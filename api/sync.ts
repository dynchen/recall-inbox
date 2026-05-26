import type { IncomingMessage, ServerResponse } from "node:http";
import { handleVercelNodeRequest } from "../src/runtime/vercel.js";

export default function handler(request: IncomingMessage, response: ServerResponse): Promise<void> {
  return handleVercelNodeRequest(request, response, "/api/sync");
}
