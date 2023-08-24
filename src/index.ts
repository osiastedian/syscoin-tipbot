import { Client, Message } from "discord.js";
import { TrackModule } from "./modules/track";
import { TrackController } from "./controllers/track-controller";
import connectDb from "./repositories/utils/connect-db";
import { Application } from "express";
import { ChannelConfigurationController } from "./controllers/channel-configuration-controller";
import { BaseModule } from "./modules/base";

connectDb();
let modules: BaseModule[] = [];

export const loadModules = (client: Client) => {
  modules = [new TrackModule(client)];
};

export const onMessage = (message: Message) => {
  modules.forEach((module) =>
    module.onMessage(message).catch((error) => {
      // Log error from module
      console.error(`Error in module ${module.name}:`, error);
    })
  );
};

export const setUpControllers = (app: Application, client: Client) => [
  new TrackController(app),
  new ChannelConfigurationController(app, client),
];

export default onMessage;
