import type { IUser } from "./models/models";
import { config } from "./config";

export const isVapiBusy = async (): Promise<boolean> => {
    try {
        const res = await fetch("https://api.vapi.ai/call?limit=10", {
            headers: { Authorization: `Bearer ${config.vapi.apiKey}` },
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

export const makeCall = async (
    user: IUser,
    call: { name: string; number: string }
) => {
    const res = await fetch("https://api.vapi.ai/call", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${config.vapi.apiKey}`,
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
    await res.json()

    console.log(`✅ Call made to ${call.name} (${call.number})`);
    activeCallCount++;
};