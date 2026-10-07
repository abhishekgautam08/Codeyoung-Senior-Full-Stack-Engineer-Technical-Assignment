import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IWorkingWindow {
  /** Start time in local "HH:mm" format */
  startLocal: string;
  /** End time in local "HH:mm" format — may be less than startLocal if window crosses midnight */
  endLocal: string;
}

export interface IMentor extends Document {
  _id: Types.ObjectId;
  name: string;
  email: string;
  timezone: string;
  workingWindows: IWorkingWindow[];
  avatarUrl: string;
  bio: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const workingWindowSchema = new Schema<IWorkingWindow>(
  {
    startLocal: { type: String, required: true, match: /^\d{2}:\d{2}$/ },
    endLocal: { type: String, required: true, match: /^\d{2}:\d{2}$/ },
  },
  { _id: false }
);

const mentorSchema = new Schema<IMentor>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    timezone: { type: String, required: true, default: 'Asia/Kolkata' },
    workingWindows: { type: [workingWindowSchema], required: true },
    avatarUrl: { type: String, default: '' },
    bio: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Mentor = mongoose.model<IMentor>('Mentor', mentorSchema);
