import mongoose, { Schema } from "mongoose";

const CallDataSchema = new Schema({}, { strict: false });

CallDataSchema.index({ userId: 1 });
CallDataSchema.index({ startedAt: 1 });

// export default mongoose.model("CallData", CallDataSchema); 
const CallData = mongoose.models.CallData || mongoose.model("CallData", CallDataSchema);
export default CallData