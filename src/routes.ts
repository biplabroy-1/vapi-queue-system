import { Router, Request, Response } from "express";
import { queueCalls, startQueue } from "./services/call.service";
import { isValidTimeFormat } from "./config";
import { IQueueCallsRequest, IStartQueueRequest } from "./models/user.model";

const router = Router();

router.post("/queue-calls", async (req: Request, res: Response): Promise<Response> => {
  try {
    const { clerkId, contacts, callTimeStart, callTimeEnd } = req.body as IQueueCallsRequest;

    if (!clerkId || !Array.isArray(contacts)) {
      return res.status(400).json({ error: "clerkId and contacts[] required" });
    }

    if ((callTimeStart && !isValidTimeFormat(callTimeStart)) || 
        (callTimeEnd && !isValidTimeFormat(callTimeEnd))) {
      return res.status(400).json({ error: "Invalid time format. Use HH:mm" });
    }

    const result = await queueCalls(clerkId, contacts, callTimeStart, callTimeEnd);
    return res.json(result);
  } catch (err) {
    console.error("❌ Queue error:", err instanceof Error ? err.message : String(err));
    const message = err instanceof Error ? err.message : "Internal Server Error";
    const status = message.includes("not found") ? 404 : 
                   message.includes("No valid contacts") ? 400 : 500;
    return res.status(status).json({ error: message });
  }
});


router.post("/start-queue", async (req: Request, res: Response): Promise<Response> => {
  try {
    const { clerkId } = req.body as IStartQueueRequest || {};
    const result = await startQueue(clerkId);
    return res.json(result);
  } catch (err) {
    console.error("❌ Start queue error:", err instanceof Error ? err.message : String(err));
    const message = err instanceof Error ? err.message : "Internal Server Error";
    const status = message.includes("not found") ? 404 : 
                   message.includes("No calls in queue") ? 400 : 500;
    return res.status(status).json({ error: message });
  }
});


export default router;