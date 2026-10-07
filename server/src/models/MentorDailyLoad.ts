import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IMentorDailyLoad extends Document {
  _id: Types.ObjectId;
  mentorId: Types.ObjectId;
  mentorLocalDate: string;
  count: number;
}

const mentorDailyLoadSchema = new Schema<IMentorDailyLoad>(
  {
    mentorId: { type: Schema.Types.ObjectId, ref: 'Mentor', required: true },
    mentorLocalDate: { type: String, required: true },
    count: { type: Number, required: true, default: 0 },
  },
  { timestamps: true }
);

// Ensure one counter per mentor per day
mentorDailyLoadSchema.index(
  { mentorId: 1, mentorLocalDate: 1 },
  { unique: true, name: 'unique_mentor_daily_load' }
);

export const MentorDailyLoad = mongoose.model<IMentorDailyLoad>(
  'MentorDailyLoad',
  mentorDailyLoadSchema
);
