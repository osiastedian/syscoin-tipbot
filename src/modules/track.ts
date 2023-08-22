import { ITrack, TrackModel } from "../repositories/track";
import { BaseModule } from "./base";
import { Message } from "discord.js";

const channelIds = process.env.TRACK_CHANNEL_IDS?.split(",") || [];

export class TrackModule extends BaseModule {
  name = "Tracking";

  constructor() {
    super();
    this.log(`Tracking ${channelIds.length} channels:`);
    this.log(`Tracking ${channelIds.join(", ")}`);
  }

  async onMessage(message: Message): Promise<ITrack | null> {
    if (!channelIds.includes(message.channel.id)) {
      return Promise.resolve(null);
    }
    const trackData: ITrack = {
      content: message.content,
      authorId: message.author.id,
      channelId: message.channel.id,
      messageId: message.id,
      createdAt: message.createdAt,
    };

    const track = await TrackModel.create(trackData);
    this.log("Track created:", track.toObject({ versionKey: false }));
    return track.toObject({ versionKey: false });
  }
}
