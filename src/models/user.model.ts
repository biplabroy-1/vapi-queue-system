import mongoose, { Schema, Document } from "mongoose";

export interface IContact {
  name: string;
  number: string;
  status?: string;
}

export interface ITwilioConfig {
  sid: string;
  authToken: string;
  phoneNumber: string;
}

export interface IUser extends Document {
  _id: string;
  clerkId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  profileImageUrl?: string;
  phoneNumber?: string;
  twilioConfig: ITwilioConfig;
  assistantId: string;
  content: string;
  callQueue: IContact[];
  callQueueDone: IContact[];
  callTimeStart: string;
  callTimeEnd: string;
  createdAt: Date;
  updatedAt: Date;
}

const CallQueueSchema = new Schema(
  {
    name: { type: String, required: true },
    number: { type: String, required: true },
    status: { type: String }
  },
  { _id: false }
);

const TwilioConfigSchema = new Schema(
  {
    sid: { type: String },
    authToken: { type: String },
    phoneNumber: { type: String },
  },
  { _id: false }
);

const UserSchema = new Schema(
  {
    _id: { type: String, required: true },
    clerkId: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    firstName: { type: String },
    lastName: { type: String },
    profileImageUrl: { type: String },
    phoneNumber: { type: String },
    twilioConfig: TwilioConfigSchema,
    assistantId: { type: String },
    content: { type: String },
    callQueue: [CallQueueSchema],
    callQueueDone: [CallQueueSchema],
    callTimeStart: { type: String, default: "03:30" },
    callTimeEnd: { type: String, default: "05:30" },
  },
  { timestamps: true }
);

export const User = mongoose.models.User || mongoose.model<IUser>("User", UserSchema);

export interface IQueueCallsRequest {
  clerkId: string;
  contacts: IContact[];
  callTimeStart?: string;
  callTimeEnd?: string;
}

export interface IStartQueueRequest {
  clerkId?: string;
}

export interface IVapiCallResponse {
  id: string;
  status: string;
  [key: string]: any;
}