import express from "express";
import mongoose, { Schema, Document } from "mongoose";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import cors from "cors";


dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
app.use(bodyParser.json());
app.use(cors());

/* ----------------------- ENV CHECK ----------------------- */
const requiredEnv = ["MONGODB_URI", "VAPI_API_KEY"];
for (const key of requiredEnv) {
    if (!process.env[key]) {
        console.error(`❌ Missing environment variable: ${key}`);
        process.exit(1);
    }
}

/* ----------------------- DB CONNECTION ----------------------- */
let dbConnecting = false;
const connectDB = async () => {
    if (mongoose.connection.readyState !== 1 && !dbConnecting) {
        dbConnecting = true;
        try {
            await mongoose.connect(process.env.MONGODB_URI!);
            console.log("✅ MongoDB connected");
        } finally {
            dbConnecting = false;
        }
    }
};

/* ----------------------- SCHEMAS & MODELS ------------------------ */
interface IUser extends Document {
    _id: string;
    clerkId: string;
    email: string;
    phoneNumber: string;
    twilioConfig: {
        sid: string;
        authToken: string;
        phoneNumber: string;
    };
    assistantId: string;
    content: string;
    callQueue: {
        name: string;
        number: string;
    }[];
    callTimeStart: string; // HH:mm format
    callTimeEnd: string; // HH:mm format
    createdAt: Date;
    updatedAt: Date;
}

const CallQueueSchema: Schema = new Schema(
    {
        name: { type: String, required: true },
        number: { type: String, required: true },
    },
    { _id: false }
);

const UserSchema: Schema = new Schema(
    {
        _id: { type: String, required: true },
        clerkId: { type: String, required: true, unique: true },
        email: { type: String, required: true, unique: true },
        firstName: { type: String },
        lastName: { type: String },
        profileImageUrl: { type: String },
        phoneNumber: { type: String },
        twilioConfig: {
            sid: { type: String },
            authToken: { type: String },
            phoneNumber: { type: String },
        },
        assistantId: { type: String },
        content: { type: String },
        callQueue: [CallQueueSchema],
        callTimeStart: { type: String, default: "03:30" }, // Default 9 AM
        callTimeEnd: { type: String, default: "05:30" }, // Default 5 PM
    },
    { timestamps: true }
);

const User = mongoose.models.User || mongoose.model<IUser>("User", UserSchema);

/* ------------------------- VAPI HELPERS ------------------------- */
let isProcessing = false;

const isVapiBusy = async (): Promise<boolean> => {
    try {
        const res = await fetch("https://api.vapi.ai/call?limit=5", {
            headers: {
                Authorization: `Bearer ${process.env.VAPI_API_KEY}`,
            },
        });

        const data = await res.json();
        if (!Array.isArray(data)) {
            console.error("❌ Unexpected VAPI response:", data);
            return true;
        }

        const allowedStatuses = ["ended", "queued", "scheduled"];
        return data.some(call => !allowedStatuses.includes(call?.status));
    } catch (err) {
        console.error("❌ Failed to check VAPI status:", err);
        return true;
    }
};

const isWithinCallHours = (startTime: string, endTime: string): boolean => {
    const now = new Date();
    const currentTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
    console.log("Current time:", currentTime);
    console.log("Start time:", startTime);
    console.log("End time:", endTime);
    return currentTime >= startTime && currentTime <= endTime;
};

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

const processNextCall = async (): Promise<void> => {
    if (isProcessing) return;
    isProcessing = true;

    try {
        await connectDB();

        const user = await User.findOne({ 
            callQueue: { $exists: true, $not: { $size: 0 } }
        });

        if (!user) {
            console.log("📭 No queued calls found.");
            isProcessing = false;
            return;
        }

        if (!isWithinCallHours(user.callTimeStart, user.callTimeEnd)) {
            console.log("⏰ Outside of calling hours. Waiting...");

            isProcessing = false;
            await delay(180000); // Wait 1 minute before checking again
            return processNextCall();
        }

        const vapiBusy = await isVapiBusy();
        if (vapiBusy) {
            console.log("⏳ VAPI busy. Retrying in 15s...");
            await delay(15000);
            isProcessing = false;
            return processNextCall();
        }

        // Atomically pop first call from queue
        const updatedUser = await User.findOneAndUpdate(
            { _id: user._id },
            { $pop: { callQueue: -1 } },
            { new: false }
        );

        const nextCall = updatedUser.callQueue[0]; // The one just popped

        if (!updatedUser.twilioConfig?.sid || !updatedUser.twilioConfig?.authToken || !updatedUser.twilioConfig?.phoneNumber) {
            console.error("❌ User missing Twilio config:", updatedUser._id);
            isProcessing = false;
            return;
        }

        const res = await fetch("https://api.vapi.ai/call", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${process.env.VAPI_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                assistantId: updatedUser.assistantId,
                phoneNumber: {
                    twilioAccountSid: updatedUser.twilioConfig.sid,
                    twilioPhoneNumber: updatedUser.twilioConfig.phoneNumber,
                    twilioAuthToken: updatedUser.twilioConfig.authToken,
                },
                customer: {
                    name: nextCall.name,
                    number: nextCall.number,
                },
            }),
        });

        if (!res.ok) {
            const errText = await res.text();
            console.error("❌ VAPI call failed:", errText);
            isProcessing = false;
            return processNextCall();
        }

        console.log(`✅ Call made to ${nextCall.name} (${nextCall.number})`);

        await delay(15000);
        isProcessing = false;
        return processNextCall();
    } catch (err) {
        console.error("❌ Call processing error:", err);
        await delay(15000);
        isProcessing = false;
        return processNextCall();
    }
};

/* ------------------------- ROUTES ------------------------- */

app.post("/queue-calls", async (req, res) => {
    const { clerkId, customers, callTimeStart, callTimeEnd } = req.body;

    if (!clerkId || !Array.isArray(customers)) {
        return res.status(400).json({ error: "clerkId and customers[] required" });
    }

    // Validate time format if provided
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (callTimeStart && !timeRegex.test(callTimeStart)) {
        return res.status(400).json({ error: "Invalid callTimeStart format. Use HH:mm" });
    }
    if (callTimeEnd && !timeRegex.test(callTimeEnd)) {
        return res.status(400).json({ error: "Invalid callTimeEnd format. Use HH:mm" });
    }

    try {
        await connectDB();

        const user = await User.findById(clerkId);
        if (!user) return res.status(404).json({ error: "User not found" });

        const validCustomers = customers.filter(
            c => typeof c.name === "string" && typeof c.number === "string"
        );

        if (validCustomers.length === 0) {
            return res.status(400).json({ error: "No valid customer entries." });
        }

        // Update call times if provided
        if (callTimeStart) user.callTimeStart = callTimeStart;
        if (callTimeEnd) user.callTimeEnd = callTimeEnd;

        user.callQueue.push(...validCustomers);
        await user.save();

        console.log(`📦 Queued ${validCustomers.length} calls for user ${clerkId}`);
        res.json({ 
            message: "Customers queued", 
            count: validCustomers.length,
            callTimeStart: user.callTimeStart,
            callTimeEnd: user.callTimeEnd
        });

        processNextCall();
    } catch (err) {
        console.error("❌ Failed to queue calls:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

/* ------------------------- START SERVER ------------------------- */

app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});
