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
    createdAt: Date;
    updatedAt: Date;
}

// Schema Definitions

const ContactSchema = new Schema(
    {
        name: { type: String, required: true },
        number: { type: String, required: true },
        status: { type: String },
    },
    { _id: false }
);

const fullCallDataSchema = new Schema({}, { strict: false, _id: false });

const UserSchema: Schema = new Schema(
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

        callTimeStart: { type: String, default: "03:30" },
        callTimeEnd: { type: String, default: "05:30" },
    },
    { timestamps: true }
);

// Export model
export const User = mongoose.models.User || mongoose.model<IUser>("User", UserSchema);
