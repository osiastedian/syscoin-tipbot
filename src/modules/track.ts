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

  onMessage(message: Message) {
    if (!channelIds.includes(message.channel.id)) {
      return;
    }
    const data = {
      content: message.content,
      author: message.author.username,
      channelId: message.channel.id,
      messageId: message.id,
      createdDate: message.createdTimestamp,
      isBot: message.author.bot,
    };

    this.log(data);
  }
}
