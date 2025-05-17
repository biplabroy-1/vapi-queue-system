import express from "express";
import mongoose, { Schema, type Document } from "mongoose";
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
    } catch (err) {
      console.log(err);
      process.exit(1);
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
let activeCallCount = 0;
const MAX_CONCURRENT_CALLS = 2;

const isVapiBusy = async (): Promise<boolean> => {
  try {
    const res = await fetch("https://api.vapi.ai/call?limit=10", {
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
    const activeCalls = data.filter(
      (call) => !allowedStatuses.includes(call?.status)
    );
    activeCallCount = activeCalls.length;
    return activeCallCount >= MAX_CONCURRENT_CALLS;
  } catch (err) {
    console.error("❌ Failed to check VAPI status:", err);
    return true;
  }
};

const isWithinCallHours = (startTime: string, endTime: string): boolean => {
  const now = new Date();
  const currentTime =
    `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
  console.log("Current time:", currentTime);
  console.log("Start time:", startTime);
  console.log("End time:", endTime);
  return currentTime >= startTime && currentTime <= endTime;
};

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

const makeCall = async (
  user: IUser,
  nextCall: { name: string; number: string }
) => {
  try {
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
      throw new Error(errText);
    }

    console.log(`✅ Call made to ${nextCall.name} (${nextCall.number})`);
    activeCallCount++;
  } catch (err) {
    console.error("❌ VAPI call failed:", err);
    throw err;
  }
};

const processNextCall = async (): Promise<void> => {
  try {
    await connectDB();

    const user = await User.findOne({
      callQueue: { $exists: true, $not: { $size: 0 } },
    });

    if (!user) {
      console.log("📭 No queued calls found.");
      return;
    }

    if (!isWithinCallHours(user.callTimeStart, user.callTimeEnd)) {
      console.log("⏰ Outside of calling hours. Waiting...");
      await delay(60000); // Wait 10 minutes before checking again
      return processNextCall();
    }

    const vapiBusy = await isVapiBusy();
    if (vapiBusy) {
      console.log("⏳ VAPI busy. Retrying in 15s...");
      await delay(15000);
      return processNextCall();
    }

    // Process up to 2 calls concurrently
    const callsToProcess = Math.min(2 - activeCallCount, user.callQueue.length);

    for (let i = 0; i < callsToProcess; i++) {
      const updatedUser = await User.findOneAndUpdate(
        { _id: user._id },
        { $pop: { callQueue: -1 } },
        { new: false }
      );

      if (!updatedUser?.callQueue?.[0]) continue;

      const nextCall = updatedUser.callQueue[0];

      if (
        !updatedUser.twilioConfig?.sid ||
        !updatedUser.twilioConfig?.authToken ||
        !updatedUser.twilioConfig?.phoneNumber
      ) {
        console.error("❌ User missing Twilio config:", updatedUser._id);
        continue;
      }

      await makeCall(updatedUser, nextCall);
    }

    await delay(15000);
    return processNextCall();
  } catch (err) {
    console.error("❌ Call processing error:", err);
    await delay(15000);
    return processNextCall();
  }
};

/* ------------------------- ROUTES ------------------------- */

app.post("/queue-calls", async (req, res) => {
  const { clerkId, contacts, callTimeStart, callTimeEnd } = req.body;

  if (!clerkId || !Array.isArray(contacts)) {
    return res.status(400).json({ error: "clerkId and contacts[] required" });
  }

  // Validate time format if provided
  const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
  if (callTimeStart && !timeRegex.test(callTimeStart)) {
    return res
      .status(400)
      .json({ error: "Invalid callTimeStart format. Use HH:mm" });
  }
  if (callTimeEnd && !timeRegex.test(callTimeEnd)) {
    return res
      .status(400)
      .json({ error: "Invalid callTimeEnd format. Use HH:mm" });
  }

  try {
    await connectDB();

    const user = await User.findById(clerkId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const validcontacts = contacts.filter(
      (c) => typeof c.name === "string" && typeof c.number === "string"
    );

    if (validcontacts.length === 0) {
      return res.status(400).json({ error: "No valid customer entries." });
    }

    // Update call times if provided
    if (callTimeStart) user.callTimeStart = callTimeStart;
    if (callTimeEnd) user.callTimeEnd = callTimeEnd;

    user.callQueue.push(...validcontacts);
    await user.save();

    console.log(`📦 Queued ${validcontacts.length} calls for user ${clerkId}`);
    res.json({
      message: "contacts queued",
      count: validcontacts.length,
      callTimeStart: user.callTimeStart,
      callTimeEnd: user.callTimeEnd,
    });

    processNextCall();
  } catch (err) {
    console.error("❌ Failed to queue calls:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.post("/start-queue", async (req, res) => {
  try {
    await connectDB();

    const clerkId = req.body?.clerkId;

    if (clerkId) {
      const user = await User.findById(clerkId);
      if (!user) return res.status(404).json({ error: "User not found" });

      const queueLength = user.callQueue.length;

      if (queueLength === 0) {
        return res.status(400).json({ error: "No calls in queue" });
      }

      // Start processing this user's queue
      processNextCall();

      return res.json({ message: "Queue processing started", queueLength });
    }
    const users = await User.find({}, "_id callQueue");
    const userQueueLength = users.map((user) => ({
      userId: user._id,
      queueLength: user.callQueue.length,
    }));
    const totalQueueLength = users.reduce(
      (sum, user) => sum + user.callQueue.length,
      0
    );

    return res.json({
      message: "All user queue lengths",
      userQueueLength,
      totalQueueLength,
    });
  } catch (err) {
    console.error("❌ Failed to start queue processing:", err);
    res.status(500).json({ error: "Internal Server Error", err });
  }
});

/* ------------------------- START SERVER ------------------------- */

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
