import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import fs from "fs"
import { connectDB } from "../src/connectDB";
import xlsx from "json-as-xlsx";
import dayjs from "dayjs";
import { Resend } from 'resend';
import CallData from "../src/models/callData.model";

dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);

const EMAIL_TO: string[] = process.env.EMAIL_TO?.split(',').map(email => email.trim()) as string[];

function getTodayDateRange() {
    const end = new Date(); // current time
    const endString = end.toISOString();

    const start = new Date(end.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago
    const startString = start.toISOString();

    return { startString, endString };
}

async function fetchTodayFullCallData() {
    const { startString, endString } = getTodayDateRange();

    const users = await CallData.aggregate([
        {
            $match: {
                userId: "user_2x0DhdwrWfE9PpFSljdOd3aOvYG",
                startedAt: { $gt: startString, $lt: endString }
            }
        },
        {
            $project: {
                _id: 0,
                analysis: 1,
                startedAt: 1,
                cost: 1,
                endedReason: 1,
                durationSeconds: 1,
                summary: 1,
                transcript: 1,
                recordingUrl: 1,
                call: {
                    id: 1,
                    type: 1,
                    phoneNumber: 1
                },
                customer: {
                    name: 1,
                    number: 1
                },
                assistant: {
                    id: 1,
                    name: 1
                }
            }
        }
    ]);

    return users || [];
}

function saveToXLSX(calls: any[], label: string = "AllCalls"): string {
    if (!calls.length) throw new Error("No calls to export.");

    const data = [
        {
            sheet: "Filtered Calls",
            columns: [
                { label: "Phone Number", value: "phoneNumber" },
                { label: "Customer Name", value: "customerName" },
                { label: "Customer Number", value: "customerNumber" },
                { label: "Duration", value: "duration" },
                { label: "Call Type", value: "callType" },
                { label: "Cost", value: "cost" },
                { label: "Assistant", value: "assistant" },
                { label: "Started At", value: "startedAt" },
                { label: "Ended Reason", value: "endedReason" },
                { label: "Success Evaluation", value: "successEvaluation" },
                { label: "Recording URL", value: "recordingUrl" },
                { label: "Analysis Summary", value: "analysisSummary" },
                { label: "Transcript", value: "transcript" },
            ],
            content: calls.map((call: any) => ({
                customerNumber: call.customer?.number || "Unknown",
                customerName: call.customer?.name || "Unknown",
                phoneNumber: call.call?.phoneNumber?.twilioPhoneNumber ?? "N/A",
                callType: call.call?.type ?? "N/A",
                successEvaluation: call.analysis?.successEvaluation ?? "N/A",
                cost: call.cost,
                duration: call.durationSeconds
                    ? `${Math.floor(call.durationSeconds / 60)}m ${(call.durationSeconds % 60).toFixed(2)}s`
                    : "0s",
                assistant: call.assistant?.name || "N/A",
                startedAt: call.startedAt
                    ? new Date(call.startedAt).toLocaleString()
                    : "N/A",
                endedReason: call.endedReason || "N/A",
                recordingUrl: call.recordingUrl || "N/A",
                analysisSummary: call.summary || "N/A",
                transcript: call.transcript || "N/A",
            })),
        },
    ];

    const fileName = `${label}_${dayjs().format("YYYY-MM-DD_HH-mm-ss")}`;
    const uploadFolder = process.cwd() + "/uploads"
    // Make sure uploads folder exists
    if (!fs.existsSync(uploadFolder)) {
        fs.mkdirSync(uploadFolder, { recursive: true });
        console.log(`📁 Created uploads folder at ${uploadFolder}`);
    }
    const filePath = path.join(uploadFolder, fileName);

    xlsx(data, {
        fileName: filePath,
        writeMode: "writeFile",
    });

    console.log(`✅ XLSX "${label}" saved to`, filePath);
    return filePath + ".xlsx";
}

function cleanUploadsFolder() {
    const uploadDir = path.join(process.cwd(), 'uploads');

    if (fs.existsSync(uploadDir)) {
        const files = fs.readdirSync(uploadDir);
        for (const file of files) {
            fs.unlinkSync(path.join(uploadDir, file));
        }
        fs.rmdirSync(uploadDir);
    }
}


async function sendEmailWithAttachment(filePaths: string[]) {
    const attachments = filePaths.map(filePath => ({
        filename: path.basename(filePath),
        content: fs.readFileSync(filePath).toString("base64"),
    }));

    try {
        const { data, error } = await resend.emails.send({
            from: "GlobalTFN Bot <noreply@mail.globaltfn.tech>",
            to: EMAIL_TO,
            subject: "Last 24 Hour Call Reports",
            html: `<p>📞 Here are the latest call reports.</p>`,
            attachments: attachments.map(file => ({
                filename: file.filename,
                content: file.content,
                contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            })),
        });

        if (error) {
            console.error("❌ Resend error:", error);
        } else {
            console.log(`📧 Email sent via Resend: ${data?.id}`);
        }
    } catch (err) {
        console.error("❌ Error sending with Resend:", err);
    }
}

async function main() {
    try {
        await connectDB();

        const data = await fetchTodayFullCallData();

        if (!data?.length) {
            console.log("No calls found for the date range.");
            return;
        }

        // Save all calls
        const allCallsPath = saveToXLSX(data, "AllCalls");

        // Filter successful calls
        const successfulCalls = data.filter((call: any) =>
            call.analysis?.successEvaluation === true &&
            call.durationSeconds > 10 &&
            call.endedReason?.toLowerCase() !== "voicemail"
        );

        let successfulCallsPath = "";
        if (successfulCalls.length) {
            successfulCallsPath = saveToXLSX(successfulCalls, "SuccessfulCalls");
        } else {
            console.log("⚠️ No successful filtered calls.");
        }

        // Send both files via email
        const filesToSend = [allCallsPath];
        if (successfulCallsPath) filesToSend.push(successfulCallsPath);

        await sendEmailWithAttachment(filesToSend);

        cleanUploadsFolder()

    } catch (err) {
        console.error("❌ Error:", err);
    } finally {
        await mongoose.disconnect();
    }
}

main();
