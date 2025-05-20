// filepath: src/analytics/vapiAnalytics.ts
import axios from 'axios';
import type { AxiosRequestConfig, AxiosResponse } from 'axios';

export interface TimeRange {
    start: string;
    end: string;
    step: "hour" | "day" | "week" | "month" | "year";
    timezone: string;
}

export interface Operation {
    operation: "sum" | "avg" | "count" | "min" | "max";
    column: string;
}

export interface Query {
    name: string;
    table: string;
    operations: Operation[];
    groupBy?: string[];
    timeRange: TimeRange;
}

export interface VapiAnalyticsOptions {
    // Customize the time range for queries
    timeRange?: {
        start?: string;
        end?: string;
        timezone?: string;
    };
}

/**
 * Gets analytics data from the VAPI API
 * @param options - Options for customizing the query
 * @returns Promise with analytics data
 */
export const getVapiAnalytics = async (options: VapiAnalyticsOptions = {}) => {
    // Default time range if not provided
    const timeStart = options.timeRange?.start || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const timeEnd = options.timeRange?.end || new Date().toISOString();
    const timezone = options.timeRange?.timezone || "UTC";

    // Define queries for analytics
    const queries: Query[] = [
        {
            name: "LLM, STT, TTS, VAPI Costs",
            table: "call",
            operations: [
                { operation: "sum", column: "costBreakdown.llm" },
                { operation: "sum", column: "costBreakdown.stt" },
                { operation: "sum", column: "costBreakdown.tts" },
                { operation: "sum", column: "costBreakdown.vapi" }
            ],
            timeRange: {
                start: timeStart,
                end: timeEnd,
                step: "month",
                timezone
            }
        },
        {
            name: "Total Call Duration",
            table: "call",
            operations: [
                { operation: "sum", column: "duration" }
            ],
            timeRange: {
                start: timeStart,
                end: timeEnd,
                step: "month",
                timezone
            }
        },
        {
            name: "Average Call Cost",
            table: "call",
            operations: [
                { operation: "avg", column: "cost" }
            ],
            timeRange: {
                start: timeStart,
                end: timeEnd,
                step: "month",
                timezone
            }
        },
        {
            name: "Number of Calls by Type",
            table: "call",
            operations: [
                { operation: "count", column: "id" }
            ],
            groupBy: [
                "type"
            ],
            timeRange: {
                start: timeStart,
                end: timeEnd,
                step: "month",
                timezone
            }
        },
        {
            name: "Number of Failed Calls",
            table: "call",
            operations: [
                { operation: "count", column: "id" }
            ],
            groupBy: [
                "endedReason"
            ],
            timeRange: {
                start: timeStart,
                end: timeEnd,
                step: "month",
                timezone
            }
        },
        {
            name: "Number of Calls by Assistant",
            table: "call",
            operations: [
                { operation: "count", column: "id" }
            ],
            groupBy: [
                "assistantId"
            ],
            timeRange: {
                start: timeStart,
                end: timeEnd,
                step: "month",
                timezone
            }
        },
        {
            name: "Average Call Duration by Assistant",
            table: "call",
            operations: [
                { operation: "avg", column: "duration" }
            ],
            groupBy: [
                "assistantId"
            ],
            timeRange: {
                start: timeStart,
                end: timeEnd,
                step: "month",
                timezone
            }
        },
        {
            name: "Total Minutes",
            table: "call",
            operations: [
                { operation: "sum", column: "duration" }
            ],
            timeRange: {
                start: timeStart,
                end: timeEnd,
                step: "month",
                timezone
            }
        },
        {
            name: "Total Spent",
            table: "call",
            operations: [
                { operation: "sum", column: "cost" }
            ],
            timeRange: {
                start: timeStart,
                end: timeEnd,
                step: "month",
                timezone
            }
        },
        {
            name: "Success Evaluation",
            table: "call",
            operations: [
                { operation: "count", column: "id" }
            ],
            groupBy: [
                "analysis.successEvaluation",
                "assistantId"
            ],
            timeRange: {
                start: timeStart,
                end: timeEnd,
                step: "month",
                timezone
            }
        }
    ];

    const data = JSON.stringify({ queries });

    // API request configuration
    const config: AxiosRequestConfig = {
        method: 'post',
        maxBodyLength: Number.POSITIVE_INFINITY,
        url: 'https://api.vapi.ai/analytics',
        headers: {
            'authorization': `Bearer ${process.env.VAPI_API_KEY}`,
            'content-type': 'application/json',
            'cache-control': 'no-cache',
            'pragma': 'no-cache',
        },
        data
    };

    try {
        const response: AxiosResponse = await axios.request(config);
        return response.data;
    } catch (error) {
        console.error('Error fetching VAPI analytics:', error);
        throw error;
    }
};
