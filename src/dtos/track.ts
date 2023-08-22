import { ITrack } from "../repositories/track";

export interface ITrackDto {
  content: string;
  authorId: string;
  channelId: string;
  messageId: string;
  createdAt: number;
}

export const toTrackDto = (track: ITrack) => {
  const dto: ITrackDto = {
    content: track.content,
    authorId: track.authorId,
    channelId: track.channelId,
    messageId: track.messageId,
    createdAt: track.createdAt.getTime(),
  };
  return dto;
};
