import express, { Request, Response } from "express";
import User from "./models/User";
import { connectDB } from "./connectDB";
import { processNextCall } from "./services/callQueueService";
import { CallQueue } from "./models/callQueue";

const router = express.Router();

// POST /queue-calls - Queue bulk contacts
// @ts-ignore
router.post("/queue-calls", async (req, res) => {
  const { clerkId, contacts, assistantId, assistantName } = req.body;

  if (!clerkId || !Array.isArray(contacts) || !assistantId) {
    return res.status(400).json({ error: "clerkId, assistantId, and contacts[] are required" });
  }

  try {
    await connectDB();
    const user = await User.findById(clerkId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const validContacts = contacts.filter(
      (c: { name: string; number: string }) =>
        typeof c.name === "string" && typeof c.number === "string"
    );

    if (!validContacts.length) {
      return res.status(400).json({ error: "No valid contacts" });
    }

    const queueDocs = validContacts.map((contact) => ({
      userId: user._id,
      agentId: assistantId,
      agentName: assistantName,
      name: contact.name,
      number: contact.number,
      status: "pending",
      createdAt: new Date()
    }));

    await CallQueue.insertMany(queueDocs);
    processNextCall();

    return res.json({
      message: `${validContacts.length} contacts queued for assistant ${assistantId}`
    });
  } catch (err) {
    console.error("❌ Queue error:", err instanceof Error ? err.message : String(err));
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// POST /start-queue - Initiate queue processing and return stats
// @ts-ignore
router.post("/start-queue", async (req, res) => {
  const { clerkId } = req.body;

  if (!clerkId) {
    return res.status(400).json({ error: "clerkId is required" });
  }

  try {
    await connectDB();
    const user = await User.findById(clerkId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const totalPending = await CallQueue.countDocuments({
      userId: user._id,
      status: "pending"
    });

    processNextCall();

    return res.json({
      message: "Queue started",
      queueStats: { totalInQueue: totalPending }
    });
  } catch (err) {
    console.error("❌ Start queue error:", err instanceof Error ? err.message : String(err));
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
  });
});


export default router;
