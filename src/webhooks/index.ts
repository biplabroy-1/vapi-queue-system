// filepath: src/webhooks/index.ts
import express, { type Request, type Response } from "express";
import { endOfCallReportHandler, VapiWebhookEnum, } from "./endOfCallReport";

const router = express.Router();

/**
 * Main webhook handler that routes different webhook types to their specific handlers
 */
router.post("/", async (req: Request, res: Response) => {
    try {
        const payload = req.body;
        
        // Validate payload and payload.message
        if (!payload || !payload.message || !payload.message.type) {
            console.error("Invalid payload: Missing required 'message' or 'type' field.");
            return res.status(400).json({ error: "Invalid payload: Missing required 'message' or 'type' field." });
        }
        console.log(payload.message.type);

        // Process different webhook types
        switch (payload.message.type) {
            case VapiWebhookEnum.END_OF_CALL_REPORT:
                await endOfCallReportHandler(payload);
                break;

            case VapiWebhookEnum.STATUS_UPDATE:
                // Could handle status updates here
                console.log(`Status update for call: ${payload.call?.id || "unknown"}`);
                break;

            case VapiWebhookEnum.TRANSCRIPT:
                // Could handle real-time transcript updates here
                console.log(`Transcript update received for call: ${payload.call?.id || "unknown"}`);
                break;

            // Add other webhook handlers as needed
            default:
                console.log(`Received webhook of type: ${payload}`);
        }

        res.status(200).json({ status: "success" });
    } catch (error) {
        console.error("Error processing webhook:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

export default router;
