import dayjs from "dayjs";
import { groq } from '@ai-sdk/groq';
import { generateObject } from 'ai';
import { z } from 'zod';

export const isWithinCallHours = (startTime: string, endTime: string): boolean => {
    const currentTime = dayjs().format("HH:mm");

    const toMinutes = (time: string) => {
        const [h, m] = time.split(":").map(Number);
        return h * 60 + m;
    };

    console.log("Current time:", currentTime);
    console.log("Start time:", startTime);
    console.log("End time:", endTime);

    const start = toMinutes(startTime);
    const end = toMinutes(endTime);
    const current = toMinutes(currentTime);

    if (start <= end) {
        return current >= start && current <= end;
    } else {
        return current >= start || current <= end;
    }
};

export const delay = (seconds: number) => new Promise(resolve => setTimeout(resolve, seconds * 1000));

export default function toHumanReadableDate(isoString: string, locale = "default", timeZone?: string): string {
    try {
        const date = new Date(isoString);

        const options: Intl.DateTimeFormatOptions = {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            timeZoneName: "short",
            timeZone: timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone
        };

        return date.toLocaleString(locale, options);
    } catch (error) {
        return "Invalid date format";
    }
}

// Schedule utility functions
export type TimeSlot = 'morning' | 'afternoon' | 'evening' | null;
export type DayOfWeek = 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday';

export const getCurrentTimeSlot = (
    weeklySchedule: any,
    dayOfWeek: string
): { slotName: string | null; slotData: any | null } => {
    const now = dayjs();
    const currentTime = now.format("HH:mm");

    const slots = weeklySchedule?.[dayOfWeek];
    if (!slots) return { slotName: null, slotData: null };

    for (const [slotName, slotData] of Object.entries(slots)) {
        const { callTimeStart, callTimeEnd } = slotData as any;

        if (
            callTimeStart &&
            callTimeEnd &&
            currentTime >= callTimeStart &&
            currentTime <= callTimeEnd
        ) {
            return { slotName, slotData };
        }
    }

    return { slotName: null, slotData: null };
};

export const getCurrentDayOfWeek = (): DayOfWeek => {
    const days: DayOfWeek[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayIndex = new Date().getDay();
    return days[dayIndex];
};

// Example usage:
const iso = new Date().toISOString();
console.log("Local Time", toHumanReadableDate(iso));                        // Local time
console.log("UTC Time", toHumanReadableDate(iso, "en-US", "UTC"));          // UTC
console.log("IST Time", toHumanReadableDate(iso, "en-IN", "Asia/Kolkata")); // IST

export const CallInsightSchema = z.object({
    intent: z.enum(["buy", "not_buy", "undecided"])
        .describe("Did the customer show intent to buy?"),

    main_reason: z.string().max(200)
        .describe("The main reason for buying, or the main objection if not buying."),

    positive_triggers: z.array(z.string())
        .describe("Key things they liked or responded positively to."),

    negative_triggers: z.array(z.string())
        .describe("Key problems or objections they raised."),

    // non-sensitive background info (not PII)
    customer_context: z.object({
        profession: z.string().optional()
            .describe("Job/profession if clearly mentioned."),
        industry: z.string().optional()
            .describe("Industry or business domain if mentioned."),
        role: z.string().optional()
            .describe("Role in company if mentioned (e.g., owner, manager)."),
        personal_notes: z.array(z.string()).optional()
            .describe("Random personal context explicitly mentioned, e.g., hobbies, likes, casual interests or any other things.")
    }).optional()
});

type CallInsight = z.infer<typeof CallInsightSchema>;

export async function analyzeCallInsight(transcript: string): Promise<CallInsight> {
    const { object } = await generateObject({
        model: groq('moonshotai/kimi-k2-instruct'),
        schema: CallInsightSchema,
        prompt: `Analyze the customer's emotional tone in the transcript below.
                Return only structured JSON.

                Transcript: 
                ${transcript}`
    });

    return object;
}


