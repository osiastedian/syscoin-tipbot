import { Message } from "discord.js";
import { TrackModule } from "./modules/track";
import { TrackController } from "./controllers/track-controller";

const modules = [new TrackModule()];

export const onMessage = (message: Message) => {
  modules.forEach((module) => module.onMessage(message));
};

export const setUpControllers = (app) => [new TrackController(app)];

export default onMessage;
