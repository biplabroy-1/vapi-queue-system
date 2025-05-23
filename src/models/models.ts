import mongoose, { Schema, type Document } from "mongoose";

// Subinterfaces
interface TwilioConfig {
    sid: string;
    authToken: string;
    phoneNumber: string;
}

export interface Contact {
    name: string;
    number: string;
    status?: string
}

// Schedule interfaces
export interface ScheduleSlot {
    assistantName: string,
    assistantId: string,
    callTimeStart: string,
    callTimeEnd: string,
}

export interface DailySchedule {
    morning: ScheduleSlot; // 9am-11am
    afternoon: ScheduleSlot; // 1pm-3pm
    evening: ScheduleSlot; // 6pm-8pm
}

export interface WeeklySchedule {
    sunday: DailySchedule;
    monday: DailySchedule;
    tuesday: DailySchedule;
    wednesday: DailySchedule;
    thursday: DailySchedule;
    friday: DailySchedule;
    saturday: DailySchedule;
}

export interface IUser extends Document {
    _id: string;
    clerkId: string;
    email: string;
    firstName?: string;
    lastName?: string;
    profileImageUrl?: string;
    phoneNumber: string;
    twilioConfig: TwilioConfig;
    assistantId: string;
    content: string;
    callQueue: Contact[];
    callQueueDone: (Contact & { status?: string })[];
    fullCallData?: Record<string, any>[];
    callTimeStart: string;
    callTimeEnd: string;
    weeklySchedule?: WeeklySchedule;
    createdAt: Date;
    updatedAt: Date;
}

// Schema Definitions

const ContactSchema: Schema<Contact> = new Schema(
    {
        name: { type: String, required: true },
        number: { type: String, required: true },
        status: { type: String },
    },
    { _id: false }
);

const ScheduleSlotSchema: Schema<ScheduleSlot> = new Schema(
    {
        assistantName: { type: String, required: true },
        assistantId: { type: String, required: true },
        callTimeStart: { type: String, required: true },
        callTimeEnd: { type: String, required: true },
    },
    { _id: false }
);

const DailyScheduleSchema = new Schema(
    {
        morning: { type: ScheduleSlotSchema, required: true },
        afternoon: { type: ScheduleSlotSchema, required: true },
        evening: { type: ScheduleSlotSchema, required: true },
    },
    { _id: false }
);

const WeeklyScheduleSchema = new Schema(
    {
        sunday: { type: DailyScheduleSchema, required: true },
        monday: { type: DailyScheduleSchema, required: true },
        tuesday: { type: DailyScheduleSchema, required: true },
        wednesday: { type: DailyScheduleSchema, required: true },
        thursday: { type: DailyScheduleSchema, required: true },
        friday: { type: DailyScheduleSchema, required: true },
        saturday: { type: DailyScheduleSchema, required: true },
    },
    { _id: false }
);

const fullCallDataSchema = new Schema({}, { strict: false, _id: false });

const UserSchema: Schema<IUser> = new Schema(
    {
        _id: { type: String, required: true },
        clerkId: { type: String, required: true, unique: true },
        email: { type: String, required: true, unique: true },
        firstName: { type: String },
        lastName: { type: String },
        profileImageUrl: { type: String },
        phoneNumber: { type: String },
        twilioConfig: {
            sid: { type: String },
            authToken: { type: String },
            phoneNumber: { type: String },
        },
        assistantId: { type: String },
        content: { type: String },

        callQueue: [ContactSchema],
        callQueueDone: [ContactSchema],
        fullCallData: [fullCallDataSchema],

        // Weekly schedule configuration
        weeklySchedule: { type: WeeklyScheduleSchema }
    },
    { timestamps: true }
);

// Export model
export const User = mongoose.models.User || mongoose.model<IUser>("User", UserSchema);
