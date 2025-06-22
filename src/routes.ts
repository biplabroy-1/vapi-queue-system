import express from "express";
import User from "./models/models";
import { connectDB } from "./connectDB";
import { processNextCall } from "./services/callQueueService";

const router = express.Router();

// Queue calls route handler
// @ts-ignore
router.post("/queue-calls", async (req, res) => {
    const { clerkId, contacts, assistantId } = req.body;

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

        // Ensure callQueue is a plain object
        if (!user.callQueue || typeof user.callQueue !== "object") {
            user.callQueue = {};
        }

        if (!user.callQueue[assistantId]) {
            user.callQueue[assistantId] = [];
        }

        user.callQueue[assistantId].push(...validContacts);
        user.markModified('callQueue');
        await user.save();

        processNextCall();

        return res.json({
            message: `${validContacts.length} contacts queued for assistant ${assistantId}`,
        });
    } catch (err) {
        console.error("❌ Queue error:", err instanceof Error ? err.message : String(err));
        return res.status(500).json({ error: "Internal Server Error" });
    }
});


// Start queue route handler - only starts the queue
// @ts-ignore
router.post("/start-queue", async (req, res) => {
    try {
        await connectDB();
        const { clerkId } = req.body;

        if (!clerkId) {
            return res.status(400).json({ error: "clerkId is required" });
        }

        const user = await User.findById(clerkId);
        if (!user) return res.status(404).json({ error: "User not found" });
        if (!user.callQueue) return res.status(400).json({ error: "No calls in queue" });

        processNextCall();
        const aggregateResult = await User.aggregate([
            {
                $match: {
                    _id: user?.id
                }
            },
            {
                $project: {
                    callQueueArray: {
                        $reduce: {
                            input: { $objectToArray: { $ifNull: ["$callQueue", {}] } },
                            initialValue: [],
                            in: { $concatArrays: ["$$value", "$$this.v"] }
                        }
                    },
                }
            },
            {
                $project: {
                    callQueueLength: { $size: "$callQueueArray" },
                }
            },
            {
                $project: {
                    queueStats: {
                        totalInQueue: "$callQueueLength",
                    }
                }
            }
        ]);
        return res.json({ message: "Queue started", queueLength: aggregateResult[0] || 99 });
    } catch (err) {
        console.error("❌ Start queue error:", err instanceof Error ? err.message : String(err));
        return res.status(500).json({ error: "Internal Server Error" });
    }
});

export default router;