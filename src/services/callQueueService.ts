import { User, type IUser, type DailySchedule, type WeeklySchedule } from "../models/models";
import { connectDB } from "../connectDB";
import { makeCall, isVapiBusy } from "../vapiHelpers";
import { isWithinCallHours, delay, getCurrentDayOfWeek, getCurrentTimeSlot } from "../utils";

let isProcessingQueue = false;

export const processNextCall = async (): Promise<void> => {
    if (isProcessingQueue) {
        return;
    }

    isProcessingQueue = true;

    try {
        await connectDB();

        const user = await User.findOne({
            callQueue: { $exists: true, $not: { $size: 0 } },
        })
            .select('_id callQueue callTimeStart callTimeEnd twilioConfig assistantId weeklySchedule')
            .lean() as IUser | null;

        if (!user) {
            console.log("📭 No queued calls found.");
            isProcessingQueue = false;
            return;
        }

        const { _id, callQueue, assistantId, weeklySchedule } = user;

        const dayOfWeek = getCurrentDayOfWeek() as keyof WeeklySchedule;
        console.log(dayOfWeek);

        const { slotName, slotData } = getCurrentTimeSlot(weeklySchedule, dayOfWeek);
        console.log("time slot", slotName);
        console.log("Slot Data", slotData);


        let effectiveAssistantId = assistantId;
        let shouldMakeCall = true;

        if (weeklySchedule) {
            if (!slotName) {
                console.log("⏰ Current time is outside scheduled slots. Skipping call.");
                shouldMakeCall = false;
            } else {
                const scheduledSlot = weeklySchedule[dayOfWeek]?.[slotName as keyof DailySchedule];

                if (scheduledSlot) {
                    // If scheduledSlot has assistantId directly, use it
                    if (scheduledSlot.assistantId) {
                        effectiveAssistantId = scheduledSlot.assistantId;
                        console.log(`📅 Using scheduled assistant: ${scheduledSlot.assistantName || 'Unknown'} - ID: ${effectiveAssistantId}`);
                    } else {
                        console.log(`⚠️ No assistant ID in schedule for ${dayOfWeek} ${slotName}. Using default.`);
                    }
                } else {
                    console.log(`⚠️ No schedule configured for ${dayOfWeek} ${slotName}. Skipping call.`);
                    shouldMakeCall = false;
                }
            }
        }

        if (!effectiveAssistantId) {
            console.warn(`⚠️ User ${_id} has no valid assistant ID. Skipping...`);
            isProcessingQueue = false;
            return;
        }

        if (!shouldMakeCall) {
            console.log(`📅 Not scheduled to make calls at ${dayOfWeek} ${slotName || 'outside hours'}. Waiting...`);
            isProcessingQueue = false;
            await delay(600);
            return processNextCall();
        }

        if (!isWithinCallHours(slotData.callTimeStart, slotData.callTimeEnd)) {
            console.log(`⏰ Outside calling hours for user ${_id}. Waiting...`);
            isProcessingQueue = false;
            await delay(600);
            return processNextCall();
        }

        if (await isVapiBusy()) {
            console.log("⏳ VAPI busy. Retrying in 15s...");
            isProcessingQueue = false;
            await delay(15);
            return processNextCall();
        }

        const availableSlots = Math.min(MAX_CONCURRENT_CALLS - activeCallCount, callQueue.length);

        if (availableSlots <= 0) {
            console.log("📞 Max concurrent calls reached or no calls to process. Retrying in 15s...");
            isProcessingQueue = false;
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

                await makeCall(user, call, effectiveAssistantId);

                await User.findOneAndUpdate(
                    {
                        _id,
                        "callQueueDone": {
                            $elemMatch: {
                                name: call.name,
                                number: call.number,
                                status: "pending_initiation"
                            }
                        }
                    },
                    {
                        $set: { "callQueueDone.$.status": "initiated" },
                    }
                );
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err);
                console.error(`❌ Call to ${call.name}: ${msg}`);

                await User.updateOne(
                    { _id, "callQueueDone": { $elemMatch: { name: call.name, number: call.number, status: "pending_initiation" } } },
                    { $set: { "callQueueDone.$.status": "failed_to_initiate" } }
                );
            }
        }

        isProcessingQueue = false;
        await delay(5);
        return processNextCall();
    } catch (err) {
        console.error(`❌ Processing error: ${err instanceof Error ? err.message : String(err)}`);
        isProcessingQueue = false;
        await delay(30);
        return processNextCall();
    }
};
