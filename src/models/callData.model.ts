import mongoose, { Schema } from "mongoose";

const CallDataSchema = new Schema({}, { strict: false });

// export default mongoose.model("CallData", CallDataSchema); 
const CallData = mongoose.models.CallData || mongoose.model("CallData", CallDataSchema);
export default CallData