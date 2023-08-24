import { ITrack, TrackModel } from "../repositories/track";
import { ChannelConfigurationService } from "../services/channel-configuration";
import { BaseModule } from "./base";
import { Client, Message } from "discord.js";

const channelIds = process.env.TRACK_CHANNEL_IDS?.split(",") || [];

export class TrackModule extends BaseModule {
  name = "Tracking";

  private channelConfigurationService: ChannelConfigurationService;

  constructor(private discordClient: Client) {
    super();
    this.log(`Tracking ${channelIds.length} channels:`);
    this.log(`Tracking ${channelIds.join(", ")}`);
    this.channelConfigurationService = new ChannelConfigurationService(
      this.discordClient
    );
  }

  async onMessage(message: Message): Promise<ITrack | null> {
    const channelId = message.channel.id;
    const isTrackingEnabled =
      await this.channelConfigurationService.isTrackingEnabled(channelId);
    if (!isTrackingEnabled || message.author.bot) {
      return Promise.resolve(null);
    }
    const trackData: ITrack = {
      content: message.content,
      authorId: message.author.id,
      channelId,
      messageId: message.id,
      createdAt: message.createdAt,
    };

    const track = await TrackModel.create(trackData);
    this.log("Track created:", track.toObject({ versionKey: false }));
    return track.toObject({ versionKey: false });
  }
}
