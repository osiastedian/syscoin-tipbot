import { Message } from "discord.js";
import { TrackModule } from "./modules/track";
import { TrackController } from "./controllers/track-controller";
import connectDb from "./repositories/utils/connect-db";

connectDb();
const modules = [new TrackModule()];

export const onMessage = (message: Message) => {
  modules.forEach((module) =>
    module.onMessage(message).catch((error) => {
      // Log error from module
      console.error(`Error in module ${module.name}:`, error);
    })
  );
};

export const setUpControllers = (app) => [new TrackController(app)];

export default onMessage;
