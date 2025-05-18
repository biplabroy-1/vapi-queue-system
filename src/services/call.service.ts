import { connectDB, env, delay, isWithinTimeRange } from "../config";
import { User, IUser, IContact, IVapiCallResponse } from "../models/user.model";

const MAX_CONCURRENT_CALLS = 2;
let activeCallCount = 0;


export const isVapiBusy = async (): Promise<boolean> => {
  try {
    const res = await fetch("https://api.vapi.ai/call?limit=10", {
      headers: { Authorization: `Bearer ${env.VAPI_API_KEY}` },
    });

    if (!res.ok) {
      throw new Error(`Failed to check VAPI status: ${res.status} ${res.statusText}`);
    }

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

export const makeCall = async (
  user: IUser, 
  contact: IContact
): Promise<IVapiCallResponse> => {
  if (!user.twilioConfig?.sid || !user.twilioConfig?.authToken || !user.twilioConfig?.phoneNumber) {
    throw new Error("Missing Twilio configuration");
  }
  
  if (!user.assistantId) {
    throw new Error("Missing assistant ID");
  }

  const res = await fetch("https://api.vapi.ai/call", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.VAPI_API_KEY}`,
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
        name: contact.name, 
        number: contact.number 
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`VAPI API Error: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  console.log(`✅ Call made to ${contact.name} (${contact.number})`);
  activeCallCount++;
  
  return data;
};
export const getAvailableCallSlots = (queueLength: number): number => {
  return Math.min(MAX_CONCURRENT_CALLS - activeCallCount, queueLength);
};

export const decrementActiveCallCount = (): void => {
  activeCallCount = Math.max(0, activeCallCount - 1);
};

export const processNextCall = async (): Promise<void> => {
  try {
    await connectDB();

    const user = await User.findOne({
      callQueue: { $exists: true, $not: { $size: 0 } },
    })
      .select('_id callQueue callTimeStart callTimeEnd twilioConfig assistantId')
      .lean() as IUser | null;

    if (!user) {
      console.log("📭 No queued calls found.");
      await delay(30);
      return processNextCall();
    }

    const { _id, callQueue, callTimeStart, callTimeEnd, twilioConfig, assistantId } = user;

    if (!twilioConfig?.sid || !twilioConfig?.authToken || !twilioConfig?.phoneNumber || !assistantId) {
      console.warn(`⚠️ User ${_id} missing required config. Skipping...`);
      await delay(5);
      return processNextCall();
    }
    if (!isWithinTimeRange(callTimeStart, callTimeEnd)) {
      console.log(`⏰ Outside calling hours for user ${_id}. Waiting...`);
      await delay(1800);
      return processNextCall();
    }

    if (await isVapiBusy()) {
      console.log("⏳ VAPI busy. Retrying in 15s...");
      await delay(15);
      return processNextCall();
    }
    const availableSlots = getAvailableCallSlots(callQueue.length);
    if (availableSlots <= 0) {
      console.log("📞 Max concurrent calls reached or no calls to process. Retrying in 15s...");
      await delay(15);
      return processNextCall();
    }

    const batch = callQueue.slice(0, availableSlots);
    console.log(`📲 Processing ${batch.length} call(s) for user ${_id}`);

    for (const contact of batch) {
      try {
        const updated = await User.findOneAndUpdate(
          { _id, "callQueue.0": contact },
          {
            $pop: { callQueue: -1 },
            $push: { callQueueDone: { ...contact, status: "pending_initiation" } },
          },
          { new: true }
        );

        if (!updated) continue;

        await makeCall(user, contact);

        await User.updateOne(
          { 
            _id, 
            "callQueueDone": { 
              $elemMatch: { 
                name: contact.name, 
                number: contact.number, 
                status: "pending_initiation" 
              } 
            } 
          },
          { $set: { "callQueueDone.$.status": "initiated" } }
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`❌ Call to ${contact.name}: ${msg}`);
        if (msg.includes("VAPI API Error")) {
          decrementActiveCallCount();
        }

        await User.updateOne(
          { 
            _id, 
            "callQueueDone": { 
              $elemMatch: { 
                name: contact.name, 
                number: contact.number,
                status: "pending_initiation" 
              } 
            } 
          },
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

export const queueCalls = async (
  clerkId: string,
  contacts: IContact[],
  callTimeStart?: string,
  callTimeEnd?: string
): Promise<{
  message: string;
  callTimeStart: string;
  callTimeEnd: string;
}> => {
  await connectDB();
  
  const user = await User.findById(clerkId);
  if (!user) {
    throw new Error("User not found");
  }

  const validContacts = contacts.filter(c => 
    typeof c.name === "string" && typeof c.number === "string"
  );
  
  if (!validContacts.length) {
    throw new Error("No valid contacts");
  }

  if (callTimeStart) user.callTimeStart = callTimeStart;
  if (callTimeEnd) user.callTimeEnd = callTimeEnd;
  user.callQueue.push(...validContacts);
  await user.save();

  processNextCall();

  return {
    message: `${validContacts.length} contacts queued`,
    callTimeStart: user.callTimeStart,
    callTimeEnd: user.callTimeEnd,
  };
};


export const startQueue = async (clerkId?: string): Promise<any> => {
  await connectDB();

  if (clerkId) {
    const user = await User.findById(clerkId);
    if (!user) {
      throw new Error("User not found");
    }
    
    if (!user.callQueue.length) {
      throw new Error("No calls in queue");
    }

    processNextCall();
    return { 
      message: "Queue started", 
      queueLength: user.callQueue.length 
    };
  }

  const users = await User.find({}, "_id callQueue");
  const totalQueueLength = users.reduce(
    (sum, user) => sum + user.callQueue.length, 
    0
  );

  processNextCall();
  return {
    message: "All queues",
    users: users.map(u => ({ 
      id: u._id, 
      queueLength: u.callQueue.length 
    })),
    totalQueueLength
  };
};