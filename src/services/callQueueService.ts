import User, { type IUser, type WeeklySchedule } from "../models/User";
import { connectDB } from "../connectDB";
import { makeCall, isVapiBusy } from "../vapiHelpers";
import { isWithinCallHours, delay, getCurrentDayOfWeek, getCurrentTimeSlot } from "../utils";
import { CallQueue } from "../models/callQueue";
import { CallQueueDone } from "../models/callQueueDone";

let isProcessingQueue = false;

export const processNextCall = async (): Promise<void> => {
  if (isProcessingQueue) return;
  isProcessingQueue = true;

  try {
    await connectDB();

    const user = await User.findOne({})
      .select("_id clerkId twilioConfig weeklySchedule")
      .lean() as IUser | null;

    if (!user) return logAndDelay("📭 No users found.", 10);

    const userId = user._id;
    const { slotName, slotData } = getCurrentTimeSlot(
      user.weeklySchedule,
      getCurrentDayOfWeek() as keyof WeeklySchedule
    );
    

    if (!slotName || !slotData?.assistantId)
      return logAndDelay(`⚠️ No valid slot or assistant for ${slotName ?? "unknown"}.`, 600);

    const assistantId = slotData.assistantId;

    if (!isWithinCallHours(slotData.callTimeStart, slotData.callTimeEnd))
      return logAndDelay(`⏰ Outside calling hours for assistant ${assistantId}.`, 600);

    if (await isVapiBusy())
      return logAndDelay("⏳ VAPI is busy. Retrying in 15s...", 15);

    const nextCall = await CallQueue.findOneAndDelete({
      userId,
      agentId: assistantId,
      status: "pending",
    }).sort({ createdAt: 1 }).lean();

    if (!nextCall){
      return logAndDelay(`📭 No calls in queue for assistant ${assistantId}.`, 600);
    }
    // Record call initiation in done queue
    const callDoneDoc = await CallQueueDone.create({
      userId,
      agentId: assistantId,
      agentName: nextCall.agentName || "Test",
      name: nextCall.name,
      number: nextCall.number,
      status: "pending_initiation",
      createdAt: new Date()
    });

    try {
      await makeCall(user, nextCall, assistantId);

      await CallQueueDone.updateOne(
        { _id: callDoneDoc._id },
        { $set: { status: "initiated", completedAt: new Date() } }
      );
    } catch (err: any) {
      console.error(`❌ Call failed: ${err.message || err}`);
      await CallQueueDone.updateOne(
        { _id: callDoneDoc._id },
        {
          $set: {
            status: "failed",
            reason: err.message || "Unknown error",
            completedAt: new Date()
          }
        }
      );
    }

    return requeueSoon(5);

  } catch (err: any) {
    console.error(`❌ Unexpected error: ${err.message || err}`);
    return requeueSoon(30);
  }
};

// Utility to log and retry after delay
const logAndDelay = async (message: string, seconds: number): Promise<void> => {
  console.log(message);
  isProcessingQueue = false;
  await delay(seconds);
  return processNextCall();
};

const requeueSoon = async (seconds: number): Promise<void> => {
  isProcessingQueue = false;
  await delay(seconds);
  return processNextCall();
};
