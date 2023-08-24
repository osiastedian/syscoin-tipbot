import mongoose from "mongoose";

export interface IChannelConfiguration {
  channelId: string;
  track: boolean;
}

export const isChannelConfiguration = (
  data: unknown
): data is IChannelConfiguration => {
  const channelConfiguration = data as IChannelConfiguration;
  return (
    typeof channelConfiguration.channelId === "string" &&
    typeof channelConfiguration.track === "boolean"
  );
};

export const ChannelConfigurationSchema =
  new mongoose.Schema<IChannelConfiguration>({
    channelId: {
      type: String,
      unique: true,
      required: true,
    },
    track: {
      type: Boolean,
      required: true,
    },
  });

export const ChannelConfigurationModel = mongoose.model<IChannelConfiguration>(
  "channelConfigurations",
  ChannelConfigurationSchema
);

export default ChannelConfigurationModel;
