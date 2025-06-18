// filepath: src/webhooks/endOfCallReport.ts
import { connectDB } from "../connectDB";
import User from "../models/models";

export enum VapiWebhookEnum {
    ASSISTANT_REQUEST = "assistant-request",
    FUNCTION_CALL = "function-call",
    STATUS_UPDATE = "status-update",
    END_OF_CALL_REPORT = "end-of-call-report",
    HANG = "hang",
    SPEECH_UPDATE = "speech-update",
    TRANSCRIPT = "transcript",
}

// export interface ConversationMessage {
//     role: "user" | "system" | "bot" | "function_call" | "function_result";
//     message?: string;
//     name?: string;
//     args?: string;
//     result?: string;
//     time: number;
//     endTime?: number;
//     secondsFromStart: number;
// }

// export interface VapiCall {
//     id?: string;
//     // Add other properties as needed
// }

// interface BaseVapiPayload {
//     call: VapiCall;
// }

// export interface EndOfCallReportPayload extends BaseVapiPayload {
//     type: VapiWebhookEnum.END_OF_CALL_REPORT;
//     endedReason: string;
//     transcript: string;
//     messages: ConversationMessage[];
//     summary: string;
//     recordingUrl?: string;
// }

// // Create a schema for the end of call report
// const CallReportSchema = new mongoose.Schema(
//     {
//         callId: { type: String },
//         endedReason: { type: String },
//         transcript: { type: String },
//         summary: { type: String },
//         recordingUrl: { type: String },
//         messages: { type: Array },
//         userId: { type: String },
//     },
//     { timestamps: true }
// );

// // Create a model if it doesn't exist
// const CallReport = mongoose.models.CallReport || mongoose.model("CallReport", CallReportSchema);

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
        // Connect to DB once, ideally this is handled by a global middleware or service
        // If connectDB is idempotent, it's fine here, otherwise consider moving it.
        await connectDB();

        let user = await User.findOne({ CallQueue: { $elemMatch: { assistantId: assistantId } } });

        // If not found, use fallback user
        if (!user) {
            console.warn(`⚠ No user found with assistant ID: ${assistantId}, using fallback.`);
            user = await User.findById("user_2x0DhdwrWfE9PpFSljdOd3aOvYG");

            if (!user) {
                console.error("❌ Fallback user not found. Cannot save call report.");
                return;
            }
        }

        // Push the message into fullCallData
        await User.findByIdAndUpdate(
            user._id,
            { $push: { fullCallData: message } },
            { new: true }
        );

        console.log(`✅ Call data pushed to user ${user._id}`);
    } catch (error) {
        console.error("❌ Error saving call report:", error);
    }
};