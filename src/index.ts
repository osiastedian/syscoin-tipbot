import { Message } from "discord.js";
import { TrackModule } from "./modules/track";

const modules = [new TrackModule()];

export const onMessage = (message: Message) => {
  modules.forEach((module) => module.onMessage(message));
};

export default onMessage;
