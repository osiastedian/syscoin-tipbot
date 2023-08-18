import { BaseModule } from "./base";
import { Message } from "discord.js";

export class TrackModule extends BaseModule {
  name = "Tracking";

  onMessage(message: Message) {
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
