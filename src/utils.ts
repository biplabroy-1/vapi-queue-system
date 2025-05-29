import dayjs from "dayjs";

export const isWithinCallHours = (startTime: string, endTime: string): boolean => {
    const now = new Date();
    const currentTime =
        `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
    console.log("Current time:", currentTime);
    console.log("Start time:", startTime);
    console.log("End time:", endTime);
    return currentTime >= startTime && currentTime <= endTime;
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

export const getCurrentTimeSlot = (weeklySchedule: any, dayOfWeek: string): any | null => {
    const now = dayjs();
    const currentTime = now.format("HH:mm");

    const slots = weeklySchedule?.[dayOfWeek];
    if (!slots) return null;

    for (const [slotName, slotData] of Object.entries(slots)) {
        const { callTimeStart, callTimeEnd } = slotData as any;

        if (callTimeStart && callTimeEnd && currentTime >= callTimeStart && currentTime <= callTimeEnd) {
            return { slotName, slotData };
        }
    }

    return { slotName:null, slotData:null }; // No matching slot
};


export const getCurrentDayOfWeek = (): DayOfWeek => {
    const days: DayOfWeek[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayIndex = new Date().getDay();
    return days[dayIndex];
};

// Example usage:
const iso = new Date().toISOString();
console.log("Local Time", toHumanReadableDate(iso));                  // Local time
console.log("UTC Time", toHumanReadableDate(iso, "en-US", "UTC")); // UTC
console.log("IST Time", toHumanReadableDate(iso, "en-IN", "Asia/Kolkata")); // IST
