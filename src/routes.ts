import express from "express";
import User from "./models/models";
import { connectDB } from "./connectDB";
import { processNextCall } from "./services/callQueueService";
import { getVapiAnalytics } from "./analytics/vapiAnalytics";
import { getCurrentTimeSlot, getCurrentDayOfWeek } from "./utils";

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
        return res.json({ message: "Queue started", queueLength: user.callQueue });
    } catch (err) {
        console.error("❌ Start queue error:", err instanceof Error ? err.message : String(err));
        return res.status(500).json({ error: "Internal Server Error" });
    }
});

// Queue status route handler - shows status of all queues or user-specific queue
// @ts-ignore
router.get("/queue-status/:clerkId", async (req, res) => {
    try {
        await connectDB();

        const { clerkId } = req.params || "";
        console.log(clerkId);

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

// @ts-ignore
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

// Set or update the weekly schedule
// @ts-ignore
router.post("/schedule", async (req, res) => {
    try {
        await connectDB();
        const { clerkId, weeklySchedule } = req.body;

        if (!clerkId) {
            return res.status(400).json({ error: "clerkId is required" });
        }

        const user = await User.findById(clerkId);
        if (!user) return res.status(404).json({ error: "User not found" });

        // Update schedule if provided
        if (weeklySchedule) {
            user.weeklySchedule = weeklySchedule;
        }


        await user.save();

        return res.json({
            message: "Schedule updated successfully",
            weeklySchedule: user.weeklySchedule,
        });
    } catch (err) {
        console.error("❌ Schedule update error:", err instanceof Error ? err.message : String(err));
        return res.status(500).json({ error: "Internal Server Error" });
    }
});

// Get the current schedule
// @ts-ignore
router.get("/schedule/:clerkId", async (req, res) => {
    try {
        await connectDB();
        const { clerkId } = req.params;

        if (!clerkId) {
            return res.status(400).json({ error: "clerkId is required" });
        }

        const user = await User.findById(clerkId);
        if (!user) return res.status(404).json({ error: "User not found" });
        const currentDay = getCurrentDayOfWeek()
        return res.json({
            weeklySchedule: user.weeklySchedule || {},
            currentDay,
            currentTimeSlot: getCurrentTimeSlot(user.weeklySchedule, currentDay)
        });
    } catch (err) {
        console.error("❌ Schedule get error:", err instanceof Error ? err.message : String(err));
        return res.status(500).json({ error: "Internal Server Error" });
    }
});

export default router;