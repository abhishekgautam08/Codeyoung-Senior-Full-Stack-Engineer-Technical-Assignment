import mongoose, { Schema, Document, Types } from 'mongoose';

export type BookingStatus = 'CONFIRMED' | 'CANCELLED';

export interface IBooking extends Document {
  _id: Types.ObjectId;
  bookingRef: string;
  parentName: string;
  parentEmail: string;
  parentTimezone: string;
  childName?: string;
  childAge?: number;
  notes?: string;
  slotStartUtc: Date;
  slotEndUtc: Date;
  mentorId: Types.ObjectId;
  mentorLocalDate: string;
  meetingLink: string;
  status: BookingStatus;
  idempotencyKey?: string;
  createdAt: Date;
  updatedAt: Date;
}

const bookingSchema = new Schema<IBooking>(
  {
    bookingRef: { type: String, required: true, unique: true },
    parentName: { type: String, required: true, trim: true },
    parentEmail: { type: String, required: true, lowercase: true, trim: true },
    parentTimezone: { type: String, required: true },
    childName: { type: String, trim: true },
    childAge: { type: Number, min: 1, max: 18 },
    notes: { type: String, trim: true, maxlength: 500 },
    slotStartUtc: { type: Date, required: true },
    slotEndUtc: { type: Date, required: true },
    mentorId: { type: Schema.Types.ObjectId, ref: 'Mentor', required: true },
    mentorLocalDate: { type: String, required: true },
    meetingLink: { type: String, required: true },
    status: { type: String, enum: ['CONFIRMED', 'CANCELLED'], default: 'CONFIRMED' },
    idempotencyKey: { type: String, sparse: true },
  },
  { timestamps: true }
);

// Prevent double-booking a mentor for the same slot (only for confirmed bookings)
bookingSchema.index(
  { mentorId: 1, slotStartUtc: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'CONFIRMED' },
    name: 'unique_mentor_slot_confirmed',
  }
);

// Prevent a parent from booking the same slot twice
bookingSchema.index(
  { parentEmail: 1, slotStartUtc: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'CONFIRMED' },
    name: 'unique_parent_slot_confirmed',
  }
);

// Idempotency key index (sparse — only set when provided)
bookingSchema.index(
  { idempotencyKey: 1 },
  {
    unique: true,
    sparse: true,
    name: 'unique_idempotency_key',
  }
);

// Query optimization: find bookings by mentor + date range
bookingSchema.index({ mentorId: 1, mentorLocalDate: 1 });

export const Booking = mongoose.model<IBooking>('Booking', bookingSchema);
