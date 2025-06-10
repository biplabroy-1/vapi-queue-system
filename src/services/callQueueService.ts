import User, { type IUser, type WeeklySchedule } from "../models/models";
import { connectDB } from "../connectDB";
import { makeCall, isVapiBusy } from "../vapiHelpers";
import { isWithinCallHours, delay, getCurrentDayOfWeek, getCurrentTimeSlot } from "../utils";

let isProcessingQueue = false;

export const processNextCall = async (): Promise<void> => {
    if (isProcessingQueue) return;
    isProcessingQueue = true;

    try {
        await connectDB();

        const user = await User.findOne({
            callQueue: { $exists: true },
        })
            .select('_id callQueue callQueueDone twilioConfig weeklySchedule')
            .lean() as IUser | null;

        if (!user) {
            console.log("📭 No queued calls found.");
            isProcessingQueue = false;
            return;
        }

        const userId = user._id;
        const callQueues = user.callQueue || {};
        const weeklySchedule = user.weeklySchedule;
        const dayOfWeek = getCurrentDayOfWeek() as keyof WeeklySchedule;
        const { slotName, slotData } = getCurrentTimeSlot(weeklySchedule, dayOfWeek);


        if (!slotName || !slotData || !slotData.assistantId) {
            console.log(`⚠️ No valid time slot or assistant found for ${dayOfWeek} ${slotName || "unknown"}.`);
            isProcessingQueue = false;
            await delay(600);
            return processNextCall();
        }

        const assistantId = slotData.assistantId;
        const queue = callQueues[assistantId];

        if (!queue || queue.length === 0) {
            console.log(`📭 No calls in queue for assistant ${assistantId}.`);
            isProcessingQueue = false;
            await delay(600);
            return processNextCall();
        }

        if (!isWithinCallHours(slotData.callTimeStart, slotData.callTimeEnd)) {
            console.log(`⏰ Outside calling hours for assistant ${assistantId}.`);
            isProcessingQueue = false;
            await delay(600);
            return processNextCall();
        }

        if (await isVapiBusy()) {
            console.log("⏳ VAPI is busy. Retrying in 15s...");
            isProcessingQueue = false;
            await delay(15);
            return processNextCall();
        }

        const nextCall = queue[0];

        const updated = await User.findOneAndUpdate(
            { _id: userId },
            {
                $pull: {
                    [`callQueue.${assistantId}`]: {
                        name: nextCall.name,
                        number: nextCall.number
                    }
                },
                $push: {
                    [`callQueueDone.${assistantId}`]: {
                        ...nextCall,
                        status: "pending_initiation"
                    }
                }
            },
            { new: true }
        );

        if (!updated) {
            console.warn(`⚠️ Failed to update user queue for assistant ${assistantId}.`);
            isProcessingQueue = false;
            return;
        }

        try {
            await makeCall(user, nextCall, assistantId);

            await User.updateOne(
                {
                    _id: userId,
                    [`callQueueDone.${assistantId}`]: {
                        $elemMatch: {
                            name: nextCall.name,
                            number: nextCall.number,
                            status: "pending_initiation"
                        }
                    }
                },
                {
                    $set: {
                        [`callQueueDone.${assistantId}.$.status`]: "initiated"
                    }
                }
            );
        } catch (err: any) {
            console.error(`❌ Call to ${nextCall.name} failed: ${err}`);

            await User.updateOne(
                {
                    _id: userId,
                    [`callQueueDone.${assistantId}`]: {
                        $elemMatch: {
                            name: nextCall.name,
                            number: nextCall.number,
                            status: "pending_initiation"
                        }
                    }
                },
                {
                    $set: {
                        [`callQueueDone.${assistantId}.$.status`]: "failed_to_initiate",
                        [`callQueueDone.${assistantId}.$.reason`]: err.message
                    }
                }
            );
        }

        isProcessingQueue = false;
        await delay(5);
        return processNextCall();

    } catch (err) {
        console.error(`❌ Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
        isProcessingQueue = false;
        await delay(30);
        return processNextCall();
    }
};
