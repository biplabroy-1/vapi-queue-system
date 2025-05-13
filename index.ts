import express from "express";
import mongoose, { Schema, Document } from "mongoose";
import bodyParser from "body-parser";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
app.use(bodyParser.json());

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

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

const processNextCall = async (): Promise<void> => {
    if (isProcessing) return;
    isProcessing = true;

    try {
        await connectDB();

        const vapiBusy = await isVapiBusy();
        if (vapiBusy) {
            console.log("⏳ VAPI busy. Retrying in 15s...");
            await delay(15000);
            isProcessing = false;
            return processNextCall();
        }

        // Atomically pop first call from queue
        const user = await User.findOneAndUpdate(
            { callQueue: { $exists: true, $not: { $size: 0 } } },
            { $pop: { callQueue: -1 } },
            { new: false }
        );

        if (!user) {
            console.log("📭 No queued calls found.");
            isProcessing = false;
            return;
        }

        const nextCall = user.callQueue[0]; // The one just popped

        if (!user.twilioConfig?.sid || !user.twilioConfig?.authToken || !user.twilioConfig?.phoneNumber) {
            console.error("❌ User missing Twilio config:", user._id);
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
                assistantId: user.assistantId,
                phoneNumber: {
                    twilioAccountSid: user.twilioConfig.sid,
                    twilioPhoneNumber: user.twilioConfig.phoneNumber,
                    twilioAuthToken: user.twilioConfig.authToken,
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
    const { clerkId, customers } = req.body;

    if (!clerkId || !Array.isArray(customers)) {
        return res.status(400).json({ error: "clerkId and customers[] required" });
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

        user.callQueue.push(...validCustomers);
        await user.save();

        console.log(`📦 Queued ${validCustomers.length} calls for user ${clerkId}`);
        res.json({ message: "Customers queued", count: validCustomers.length });

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
