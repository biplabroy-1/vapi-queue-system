// models/CallQueue.ts
import mongoose from "mongoose";

const CallQueueSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  agentId: { type: String, required: true },
  agentName: { type: String },
  name: { type: String, required: true },
  number: { type: String, required: true },
  status: { type: String, enum: ['pending', 'in-progress'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

// Add indexes for userId, agentId, and status
CallQueueSchema.index({ userId: 1 });
CallQueueSchema.index({ agentId: 1 });
CallQueueSchema.index({ status: 1 });

export const CallQueue = mongoose.model("CallQueue", CallQueueSchema);