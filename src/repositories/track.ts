import mongoose from "mongoose";

export interface ITrack {
  messageId: string;
  content: string;
  channelId: string;
  authorId: string;
  createdAt: Date;
}

export const TrackSchema = new mongoose.Schema<ITrack>({
  messageId: {
    type: String,
    unique: true,
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  channelId: {
    type: String,
    required: true,
  },
  authorId: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    required: true,
  },
});

export const TrackModel = mongoose.model<ITrack>("track", TrackSchema);

export default TrackModel;
