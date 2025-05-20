// filepath: src/services/callQueueService.ts
import { User, type IUser } from "../models/models";
import { connectDB } from "../connectDB";
import { makeCall, isVapiBusy } from "../vapiHelpers";
import { isWithinCallHours, delay } from "../utils";

// State management for call processing
let isProcessingQueue = false;

/**
 * Process the next call in the queue
 */
export const processNextCall = async (): Promise<void> => {
    // Prevent multiple simultaneous queue processing
    if (isProcessingQueue) {
        return;
    }

    isProcessingQueue = true;

    try {
        await connectDB();

        const user = await User.findOne({
            callQueue: { $exists: true, $not: { $size: 0 } },
        })
            .select('_id callQueue callTimeStart callTimeEnd twilioConfig assistantId')
            .lean() as IUser | null;

        if (!user) {
            console.log("📭 No queued calls found.");
            isProcessingQueue = false;
            return;
        }

        const { _id, callQueue, callTimeStart, callTimeEnd, twilioConfig, assistantId } = user;

        // Check for missing config
        if (!twilioConfig?.sid || !twilioConfig?.authToken || !twilioConfig?.phoneNumber || !assistantId) {
            console.warn(`⚠️ User ${_id} missing required config. Skipping...`);
            isProcessingQueue = false;
            return;
        }

        // Check call hours
        if (!isWithinCallHours(callTimeStart, callTimeEnd)) {
            console.log(`⏰ Outside calling hours for user ${_id}. Waiting...`);
            isProcessingQueue = false;
            await delay(600);
            return processNextCall();
        }

        // Check VAPI availability
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

                await makeCall(user, call);

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
