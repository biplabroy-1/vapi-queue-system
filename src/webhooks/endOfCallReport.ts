// filepath: src/webhooks/endOfCallReport.ts
import { connectDB } from "../connectDB";
import User, { IUser } from "../models/User";
import CallData from "../models/callData.model";

export enum VapiWebhookEnum {
    ASSISTANT_REQUEST = "assistant-request",
    FUNCTION_CALL = "function-call",
    STATUS_UPDATE = "status-update",
    END_OF_CALL_REPORT = "end-of-call-report",
    HANG = "hang",
    SPEECH_UPDATE = "speech-update",
    TRANSCRIPT = "transcript",
}
/**
 * Handles the end of call report processing.
 * 
 * This function processes the end of call report data and performs any necessary operations
 * such as storing information (summary, transcript, recordingUrl, or messages) in a database,
 * sending notifications, or triggering downstream processes.
 *
 * @param payload - Optional payload containing end of call report data
 * @returns A Promise that resolves when the end of call report has been processed
 */
export const endOfCallReportHandler = async (payload: any): Promise<void> => {
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
        callData.save()
        
        console.log(`✅ Call data saved to CallData for user ${user._id} using: ${callData._id}`);
    } catch (error:any) {
        console.error("❌ Error saving call report:", error);
        throw new Error("❌ Error saving call report:", error);
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
