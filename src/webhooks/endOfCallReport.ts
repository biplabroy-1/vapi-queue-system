// filepath: src/webhooks/endOfCallReport.ts
import { connectDB } from "../connectDB";
import User, { IUser } from "../models/User";
import CallData from "../models/callData.model";
import { analyzeCallInsight } from "../utils";

export enum VapiWebhookEnum {
    ASSISTANT_REQUEST = "assistant-request",
    FUNCTION_CALL = "function-call",
    STATUS_UPDATE = "status-update",
    END_OF_CALL_REPORT = "end-of-call-report",
    HANG = "hang",
    SPEECH_UPDATE = "speech-update",
    TRANSCRIPT = "transcript",
}

interface EndOfCallPayload {
    message: {
        assistant?: { id?: string };
        transcript: string;
        durationSeconds: number;
        endedReason: string;
        [key: string]: any;
    };
}


export const endOfCallReportHandler = async (payload: EndOfCallPayload): Promise<void> => {

    if (!payload) {
        console.warn("⚠️ Invalid or missing payload in endOfCallReportHandler.");
        return;
    }

    const { message } = payload;
    const assistantId = message?.assistant?.id;

    if (!assistantId) {
        console.warn("⚠️ No assistant ID found in payload message.");
        return;
    }

    try {
        await connectDB();

        let user = await findUserByAssistantId(assistantId);

        if (!user) {
            console.warn(`⚠ No user found with assistant ID: ${assistantId}, using fallback.`);
            user = await User.findById("user_2x0DhdwrWfE9PpFSljdOd3aOvYG");
            if (!user) {
                console.error("❌ Fallback user not found. Cannot save call report.");
                return;
            }
        }

        // Save call data to CallData
        const callData = new CallData({
            userId: user._id,
            ...message,
        });

        if (message.endedReason === "voicemail") {
            console.info("📞 Call ended as voicemail. No further analysis needed.");
        }
        else if (message.durationSeconds <= 10) {
            console.info("📞 Call ended quickly. No further analysis needed.");
        } else {
            callData.insight = await analyzeCallInsight(message.transcript);
            callData.markModified('insight');
        }
        await callData.save();
        console.info(`✅ Call data saved to CallData for user ${user._id} using: ${callData._id}`);
    } catch (error: any) {
        console.error("❌ Error saving call report:", error);
        throw error;

    }
};

async function findUserByAssistantId(assistantIdToFind: string): Promise<IUser | null> {
    const queryConditions: any[] = []; // Use 'any' for now due to dynamic key construction

    // A safer way if you have a fixed set of days you want to check:
    const daysOfWeekToCheck = [
        'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'
    ];
    const timeSlotsToCheck = ['morning', 'afternoon', 'evening']; // Assuming these are fixed

    for (const day of daysOfWeekToCheck) {
        for (const slot of timeSlotsToCheck) {
            // Construct the full dot-notation path to assistantId for each slot
            const fullPath = `weeklySchedule.${day}.${slot}.assistantId`;
            queryConditions.push({ [fullPath]: assistantIdToFind });
        }
    }

    if (queryConditions.length === 0) {
        console.warn("No schedule paths generated for query. Check `daysOfWeekToCheck` or `timeSlotsToCheck`.");
        return null;
    }

    try {
        const user = await User.findOne({
            $or: queryConditions
        });
        return user;
    } catch (error) {
        console.error("Error finding user by assistant ID:", error);
        throw error; // Re-throw the error or handle it as appropriate
    }
}
