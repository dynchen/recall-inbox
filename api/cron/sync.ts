import type { IncomingMessage, ServerResponse } from "node:http";
import { handleVercelCronSync } from "../../src/runtime/vercel.js";

export default function handler(request: IncomingMessage, response: ServerResponse): Promise<void> {
  return handleVercelCronSync(request, response);
}
