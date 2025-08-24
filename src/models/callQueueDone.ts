// models/CallQueueDone.ts
import mongoose from "mongoose";

const CallQueueDoneSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  agentId: { type: String, required: true },
  agentName: { type: String, required: true },
  name: { type: String, required: true },
  number: { type: String, required: true },
  status: { type: String, enum: ['pending_initiation', 'initiated', 'failed'], required: true },
  reason: { type: String }, // optional if failed
  isRescheduled: { type: String, default: "false" },
  createdAt: { type: Date, default: Date.now },
  completedAt: { type: Date }
});

CallQueueDoneSchema.index({ userId: 1 });
CallQueueDoneSchema.index({ agentId: 1 });
CallQueueDoneSchema.index({ status: 1 });

export const CallQueueDone = mongoose.model("CallQueueDone", CallQueueDoneSchema);
