import { Channel, Client } from "discord.js";
import ChannelConfigurationModel, {
  IChannelConfiguration,
} from "../repositories/channel-configuration";
import { ApiError, NotFoundError } from "../utils/error";

const TRACKING_MESSAGE =
  "This channel is now being tracked by the bot for intended for improving quality of service.";
const REMOVED_TRACKING_MESSAGE =
  "This channel is no longer being tracked by the bot.";

export class ChannelConfigurationService {
  constructor(private discordClient: Client) {}

  async getAll() {
    const configurations = await ChannelConfigurationModel.find();
    return configurations;
  }

  async getById(channelId: string) {
    const configuration = await ChannelConfigurationModel.findOne({
      channelId: channelId,
    });
    return configuration;
  }

  async create(data: IChannelConfiguration) {
    let isChannelAccessible = false;

    let channel: Channel;
    try {
      channel = await this.discordClient.channels.fetch(data.channelId);
      isChannelAccessible = channel.isText();
    } catch (e) {
      throw new ApiError(500, "CHANNEL_FETCH_ERROR", "Channel fetch error");
    }

    if (!isChannelAccessible) {
      throw new ApiError(
        500,
        "CHANNEL_NOT_ACCESSIBLE",
        "Channel not accessible"
      );
    }

    const exists = await ChannelConfigurationModel.exists({
      channelId: data.channelId,
    });

    if (exists) {
      throw new ApiError(
        500,
        "CHANNEL_CONFIGURATION_EXISTS",
        "Channel configuration exists"
      );
    }

    const configuration = new ChannelConfigurationModel(data);

    const savedConfiguration = await configuration.save();
    if (configuration.track && channel.isText()) {
      this.sendDiscordTrackingMessage(savedConfiguration.channelId, true);
    }
    return savedConfiguration;
  }

  async delete(channelId: string) {
    const exists = await ChannelConfigurationModel.exists({
      channelId: channelId,
    });

    if (!exists) {
      throw new ApiError(
        500,
        "CHANNEL_CONFIGURATION_NOT_EXISTS",
        "Channel configuration not exists"
      );
    }

    const isTracking = await this.isTrackingEnabled(channelId);

    await ChannelConfigurationModel.deleteOne({ channelId: channelId });
    const channel = await this.discordClient.channels.fetch(channelId);
    if (isTracking && channel.isText()) {
      this.sendDiscordTrackingMessage(channelId, false);
    }
  }

  async update(
    channelId: string,
    data: Omit<IChannelConfiguration, "channelId">
  ) {
    const exists = await ChannelConfigurationModel.exists({
      channelId: channelId,
    });

    if (!exists) {
      throw new ApiError(
        500,
        "CHANNEL_CONFIGURATION_NOT_EXISTS",
        "Channel configuration not exists"
      );
    }

    const isTrackingEnabled = await this.isTrackingEnabled(channelId);

    const configuration = await ChannelConfigurationModel.findOneAndUpdate(
      { channelId: channelId },
      data,
      { new: true }
    );

    if (!configuration) {
      throw new ApiError(
        500,
        "CHANNEL_CONFIGURATION_UPDATE_FAILED",
        "Channel configuration update failed"
      );
    }

    if (isTrackingEnabled !== configuration.track) {
      this.sendDiscordTrackingMessage(channelId, configuration.track);
    }

    return configuration;
  }

  async isTrackingEnabled(channelId: string) {
    const configurations = await ChannelConfigurationModel.exists({
      channelId,
      track: true,
    });

    return configurations;
  }

  private async sendDiscordTrackingMessage(
    channelId: string,
    isTracking: boolean
  ) {
    const channel = await this.discordClient.channels.fetch(channelId);

    if (!channel.isText()) {
      return;
    }

    channel.send({
      content: isTracking ? TRACKING_MESSAGE : REMOVED_TRACKING_MESSAGE,
    });
  }
}
