// filepath: src/controllers/callQueueController.ts
import type { Request, Response } from "express";
import { type Contact, User } from "../models/models";
import { connectDB } from "../connectDB";
import { processNextCall } from "../services/callQueueService";


/**
 * Queue calls controller - handles API requests to add calls to the queue
 */
export const queueCalls = async (req: Request, res: Response) => {
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
        const { twilioConfig } = user
        // Check for missing config
        if (!twilioConfig?.sid || !twilioConfig?.authToken || !twilioConfig?.phoneNumber) {
            console.warn(`⚠️ User ${user.id} missing required Twilio config. Skipping...`);
            return res.json({ message: "⚠️ User ${ user.id } missing required Twilio config." })
        }

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
};

/**
 * Start queue controller - handles API requests to start the call queue
 */
export const startQueue = async (req: Request, res: Response) => {
    try {
        await connectDB();
        const { clerkId } = req.body || {};

        if (clerkId) {
            const user = await User.findById(clerkId);
            if (!user) return res.status(404).json({ error: "User not found" });
            if (!user.callQueue.length) return res.status(400).json({ error: "No calls in queue" });

            processNextCall();
            return res.json({ message: "Queue started", queueLength: user.callQueue.length });
        }

        const users = await User.find({}, "_id callQueue");
        const totalQueueLength = users.reduce((sum, user) => sum + user.callQueue.length, 0);

        return res.json({
            message: "All queues",
            users: users.map(u => ({ id: u._id, queueLength: u.callQueue.length })),
            totalQueueLength
        });
    } catch (err) {
        console.error("❌ Start queue error:", err instanceof Error ? err.message : String(err));
        return res.status(500).json({ error: "Internal Server Error" });
    }
};
