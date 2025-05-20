import express from "express";
import { type Contact, type IUser, User } from "./models/models";
import { connectDB } from "./connectDB";
import { processNextCall } from "./services/callQueueService";
import { getVapiAnalytics } from "./analytics/vapiAnalytics";

const router = express.Router();

// Queue calls route
// Queue calls route handler
router.post("/queue-calls", async (req, res) => {
    const { clerkId, contacts, callTimeStart, callTimeEnd } = req.body;

    if (!clerkId || !Array.isArray(contacts)) {
        return res.status(400).json({ error: "clerkId and contacts[] required" });
    }



    // Validate time format if provided
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if ((callTimeStart && !timeRegex.test(callTimeStart)) || (callTimeEnd && !timeRegex.test(callTimeEnd))) {
        return res.status(400).json({ error: "Invalid time format. Use HH:mm" });
    }

    try {
        await connectDB();
        const user = await User.findById(clerkId);
        if (!user) return res.status(404).json({ error: "User not found" });

        const validContacts = contacts.filter((c: Contact) => typeof c.name === "string" && typeof c.number === "string");
        if (!validContacts.length) return res.status(400).json({ error: "No valid contacts" });

        // Update call times if provided
        if (callTimeStart) user.callTimeStart = callTimeStart;
        if (callTimeEnd) user.callTimeEnd = callTimeEnd;

        user.callQueue.push(...validContacts);
        await user.save();

        processNextCall();

        return res.json({
            message: `${validContacts.length} contacts queued`,
            callTimeStart: user.callTimeStart,
            callTimeEnd: user.callTimeEnd,
        });
    } catch (err) {
        console.error("❌ Queue error:", err instanceof Error ? err.message : String(err));
        return res.status(500).json({ error: "Internal Server Error" });
    }
});
// Start queue route handler - only starts the queue
router.post("/start-queue", async (req, res) => {
    try {
        await connectDB();
        const { clerkId } = req.body;

        if (!clerkId) {
            return res.status(400).json({ error: "clerkId is required" });
        }

        const user = await User.findById(clerkId);
        if (!user) return res.status(404).json({ error: "User not found" });
        if (!user.callQueue.length) return res.status(400).json({ error: "No calls in queue" });

        processNextCall();
        return res.json({ message: "Queue started", queueLength: user.callQueue.length });
    } catch (err) {
        console.error("❌ Start queue error:", err instanceof Error ? err.message : String(err));
        return res.status(500).json({ error: "Internal Server Error" });
    }
});

// Queue status route handler - shows status of all queues or user-specific queue
router.get("/queue-status/:clerkId", async (req, res) => {
    try {
        await connectDB();
        const { clerkId } = req.params;

        // If clerkId is provided, return status for specific user
        if (clerkId) {
            const user = await User.findById(clerkId);
            if (!user) return res.status(404).json({ error: "User not found" });

            return res.json({
                userId: user._id,
                queueLength: user.callQueue.length,
                callTimeWindow: {
                    start: user.callTimeStart,
                    end: user.callTimeEnd
                }
            });
        }

        // Otherwise return all queues status
        const users = await User.find({}, "_id callQueue callTimeStart callTimeEnd");
        const totalQueueLength = users.reduce((sum, user) => sum + user.callQueue.length, 0);

        return res.json({
            message: "All queues status",
            users: users.map(u => ({
                id: u._id,
                queueLength: u.callQueue.length,
                callTimeWindow: {
                    start: u.callTimeStart,
                    end: u.callTimeEnd
                }
            })),
            totalQueueLength
        });
    } catch (err) {
        console.error("❌ Queue status error:", err instanceof Error ? err.message : String(err));
        return res.status(500).json({ error: "Internal Server Error" });
    }
});

router.post("/analytics", async (req, res) => {
    const { start, end, timezone } = req.body || {};

    try {
        // Construct timeRange object if any of the parameters exist
        const timeRange = (start || end || timezone)
            ? { start, end, timezone }
            : undefined;

        const analytics = await getVapiAnalytics({ timeRange });

        return res.json(analytics);
    } catch (err) {
        console.error("❌ Analytics error:", err instanceof Error ? err.message : String(err));
        return res.status(500).json({ error: "Error retrieving analytics" });
    }
});

export default router;