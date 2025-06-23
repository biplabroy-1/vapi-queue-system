import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import fs from "fs"
import User from "../src/models/models";
import { connectDB } from "../src/connectDB";
import xlsx from "json-as-xlsx";
import dayjs from "dayjs";
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

dotenv.config();

const EMAIL_TO: string[] = process.env.EMAIL_TO?.split(',').map(email => email.trim()) as string[];

function getTodayDateRange() {
    const end = new Date(); // current time
    const endString = end.toISOString();

    const start = new Date(end.getTime() - 48 * 60 * 60 * 1000); // 24 hours ago
    const startString = start.toISOString();

    return { startString, endString };
}

async function fetchTodayFullCallData() {
    const { startString, endString } = getTodayDateRange();

    const users = await User.aggregate([
        { $match: { clerkId: "user_2x0DhdwrWfE9PpFSljdOd3aOvYG" } },
        { $unwind: "$fullCallData" },
        { $match: { "fullCallData.startedAt": { $gt: startString, $lt: endString } } },
        {
            $group: {
                _id: "$clerkId",
                matchingCalls: {
                    $push: {
                        analysis: "$fullCallData.analysis",
                        startedAt: "$fullCallData.startedAt",
                        cost: "$fullCallData.cost",
                        endedReason: "$fullCallData.endedReason",
                        durationSeconds: "$fullCallData.durationSeconds",
                        summary: "$fullCallData.summary",
                        transcript: "$fullCallData.transcript",
                        recordingUrl: "$fullCallData.recordingUrl",
                        call: {
                            id: "$fullCallData.call.id",
                            type: "$fullCallData.call.type",
                            phoneNumber: "$fullCallData.call.phoneNumber.twilioPhoneNumber"
                        },
                        customer: {
                            name: "$fullCallData.customer.name",
                            number: "$fullCallData.customer.number"
                        },
                        assistant: {
                            id: "$fullCallData.assistant.id",
                            name: "$fullCallData.assistant.name"
                        }
                    }
                }
            }
        }
    ]);

    return users[0] || {};
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
                phoneNumber: call.call?.phoneNumber || "N/A",
                callType: call.call?.type || "N/A",
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
                analysisSummary: call.analysis?.summary || "N/A",
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

        if (!data.matchingCalls?.length) {
            console.log("No calls found for the date range.");
            return;
        }

        // Save all calls
        const allCallsPath = saveToXLSX(data.matchingCalls, "AllCalls");

        // Filter successful calls
        const successfulCalls = data.matchingCalls.filter((call: any) =>
            call.analysis?.successEvaluation === true &&
            call.durationSeconds > 20 &&
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
