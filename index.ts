import express from "express";
import mongoose, { Schema, type Document } from "mongoose";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

// Initialize express
const app = express();
app.use(bodyParser.json());
app.use(cors());
const PORT = process.env.PORT || 3000;

// Validate required environment variables
for (const key of ["MONGODB_URI", "VAPI_API_KEY"]) {
  if (!process.env[key]) {
    console.error(`❌ Missing environment variable: ${key}`);
    process.exit(1);
  }
}

// DB Connection
let dbConnecting = false;
const connectDB = async () => {
  if (mongoose.connection.readyState !== 1 && !dbConnecting) {
    dbConnecting = true;
    try {
      const DB_URL = process.env.MONGODB_URI || ""
      await mongoose.connect(DB_URL);
      console.log("✅ MongoDB connected");
    } catch (err) {
      console.error(err);
      process.exit(1);
    } finally {
      dbConnecting = false;
    }
  }
};

// Schema definitions
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
  callQueueDone: {
    name: string;
    number: string;
    status?: string;
  }[];
  callTimeStart: string;
  callTimeEnd: string;
  createdAt: Date;
  updatedAt: Date;
}

const CallQueueSchema = new Schema(
  {
    name: { type: String, required: true },
    number: { type: String, required: true },
    status: { type: String }
  },
  { _id: false }
);

const UserSchema = new Schema(
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
    callQueueDone: [CallQueueSchema],
    callTimeStart: { type: String, default: "03:30" },
    callTimeEnd: { type: String, default: "05:30" },
  },
  { timestamps: true }
);

const User = mongoose.models.User || mongoose.model<IUser>("User", UserSchema);

// VAPI helpers
let activeCallCount = 0;
const MAX_CONCURRENT_CALLS = 2;

const isVapiBusy = async (): Promise<boolean> => {
  try {
    const res = await fetch("https://api.vapi.ai/call?limit=10", {
      headers: { Authorization: `Bearer ${process.env.VAPI_API_KEY}` },
    });

    const data = await res.json();
    if (!Array.isArray(data)) {
      console.error("❌ Unexpected VAPI response:", data);
      return true;
    }

    activeCallCount = data.filter(call => !["ended", "queued", "scheduled"].includes(call?.status)).length;
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

const delay = (seconds: number) => new Promise(resolve => setTimeout(resolve, seconds * 1000));

const makeCall = async (
  user: IUser,
  call: { name: string; number: string }
) => {
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
      customer: { name: call.name, number: call.number },
    }),
  });

  if (!res.ok) {
    throw new Error(`VAPI API Error: ${res.status} ${await res.text()}`);
  }

  console.log(`✅ Call made to ${call.name} (${call.number})`);
  activeCallCount++;
};

const processNextCall = async (): Promise<void> => {
  try {
    await connectDB();

    const user = await User.findOne({
      callQueue: { $exists: true, $not: { $size: 0 } },
    })
      .select('_id callQueue callTimeStart callTimeEnd twilioConfig assistantId')
      .lean() as IUser | null;

    if (!user) {
      console.log("📭 No queued calls found.");
      return;
    }

    const { _id, callQueue, callTimeStart, callTimeEnd, twilioConfig, assistantId } = user;

    // Check for missing config
    if (!twilioConfig?.sid || !twilioConfig?.authToken || !twilioConfig?.phoneNumber || !assistantId) {
      console.warn(`⚠️ User ${_id} missing required config. Skipping...`);
      return;
    }

    // Check call hours
    if (!isWithinCallHours(callTimeStart, callTimeEnd)) {
      console.log(`⏰ Outside calling hours for user ${_id}. Waiting...`);
      await delay(1800);
      return processNextCall();
    }

    // Check VAPI availability
    if (await isVapiBusy()) {
      console.log("⏳ VAPI busy. Retrying in 15s...");
      await delay(15);
      return processNextCall();
    }

    const availableSlots = Math.min(MAX_CONCURRENT_CALLS - activeCallCount, callQueue.length);
    if (availableSlots <= 0) {
      console.log("📞 Max concurrent calls reached or no calls to process. Retrying in 15s...");
      await delay(15);
      return processNextCall();
    }

    const batch = callQueue.slice(0, availableSlots);
    console.log(`📲 Processing ${batch.length} call(s) for user ${_id}`);

    for (const call of batch) {
      try {
        const updated = await User.findOneAndUpdate(
          { _id, "callQueue.0": call },
          {
            $pop: { callQueue: -1 },
            $push: { callQueueDone: { ...call, status: "pending_initiation" } },
          },
          { new: true }
        );

        if (!updated) continue;

        await makeCall(user, call);

        await User.updateOne(
          { _id, "callQueueDone": { $elemMatch: { name: call.name, number: call.number, status: "pending_initiation" } } },
          { $set: { "callQueueDone.$.status": "initiated" } }
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`❌ Call to ${call.name}: ${msg}`);

        if (msg.includes("VAPI API Error")) activeCallCount = Math.max(0, activeCallCount - 1);

        await User.updateOne(
          { _id, "callQueueDone": { $elemMatch: { name: call.name, number: call.number, status: "pending_initiation" } } },
          { $set: { "callQueueDone.$.status": "failed_to_initiate" } }
        );
      }
    }

    await delay(5);
    return processNextCall();
  } catch (err) {
    console.error(`❌ Processing error: ${err instanceof Error ? err.message : String(err)}`);
    await delay(30);
    return processNextCall();
  }
};

// Routes
app.post("/queue-calls", async (req, res) => {
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

    const validContacts = contacts.filter(c => typeof c.name === "string" && typeof c.number === "string");
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

app.post("/start-queue", async (req, res) => {
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
});

// Start server
app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
