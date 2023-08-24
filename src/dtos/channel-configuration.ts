import { IChannelConfiguration } from "../repositories/channel-configuration";

export interface ChannelConfigurationDto {
  channelId: string;
  track: boolean;
}

export const toChannelConfigurationDto = (
  channelConfiguration: IChannelConfiguration
): ChannelConfigurationDto => ({
  channelId: channelConfiguration.channelId,
  track: channelConfiguration.track,
});
