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

function toHumanReadableDate(isoString: string, locale = "default", timeZone?: string): string {
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

// Example usage:
const iso = new Date().toISOString();
console.log(toHumanReadableDate(iso));                  // Local time
console.log(toHumanReadableDate(iso, "en-US", "UTC")); // UTC
console.log(toHumanReadableDate(iso, "en-IN", "Asia/Kolkata")); // IST
