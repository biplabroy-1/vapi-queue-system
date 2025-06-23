import mongoose, { Schema, type Document } from "mongoose";

/** ────── Subinterfaces ────── **/
interface TwilioConfig {
  sid: string;
  authToken: string;
  phoneNumber: string;
}

export interface Contact {
  name: string;
  number: string;
  assistantId: string;
  status?: string;
}

export interface ScheduleSlot {
  assistantId: string;
  assistantName: string;
  callTimeStart: string;
  callTimeEnd: string;
}

export interface DailySchedule {
  morning: ScheduleSlot;
  afternoon: ScheduleSlot;
  evening: ScheduleSlot;
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

/** ────── Main User Interface ────── **/
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

  // New structure for assistant queues
  callQueue: Record<string, Contact[]>; // assistantId: Contact[]
  callQueueDone: Record<string, (Contact & { status?: string })[]>;

  fullCallData?: Record<string, any>[];

  defaultCallTimeStart: string;
  defaultCallTimeEnd: string;

  weeklySchedule?: WeeklySchedule;

  createdAt: Date;
  updatedAt: Date;
}

/** ────── Schema Definitions ────── **/

const ScheduleSlotSchema = new Schema<ScheduleSlot>(
  {
    assistantName: { type: String, required: true },
    assistantId: { type: String, required: true },
    callTimeStart: { type: String, required: true },
    callTimeEnd: { type: String, required: true }
  },
  { _id: false }
);

const DailyScheduleSchema = new Schema<DailySchedule>(
  {
    morning: { type: ScheduleSlotSchema, required: true },
    afternoon: { type: ScheduleSlotSchema, required: true },
    evening: { type: ScheduleSlotSchema, required: true }
  },
  { _id: false }
);

const WeeklyScheduleSchema = new Schema<WeeklySchedule>(
  {
    sunday: { type: DailyScheduleSchema },
    monday: { type: DailyScheduleSchema },
    tuesday: { type: DailyScheduleSchema },
    wednesday: { type: DailyScheduleSchema },
    thursday: { type: DailyScheduleSchema },
    friday: { type: DailyScheduleSchema },
    saturday: { type: DailyScheduleSchema }
  },
  { _id: false }
);

const TwilioConfigSchema = new Schema<TwilioConfig>(
  {
    sid: { type: String, required: true },
    authToken: { type: String, required: true },
    phoneNumber: { type: String, required: true }
  },
  { _id: false }
);

const UserSchema = new Schema<IUser>(
  {
    _id: { type: String, required: true },
    clerkId: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    firstName: String,
    lastName: String,
    profileImageUrl: String,

    twilioConfig: { type: TwilioConfigSchema, required: true },
    assistantId: { type: String, required: true },
    content: { type: String },

    callQueue: {
      type: Object,
      default: () => ({})
    },

    callQueueDone: {
      type: Object,
      default: () => ({})
    },

    weeklySchedule: { type: WeeklyScheduleSchema }
  },
  { timestamps: true }
);

const User = mongoose.models.User || mongoose.model<IUser>("User", UserSchema);
export default User