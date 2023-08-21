import { Request, Response, Application } from "express";
import { TrackModel } from "../repositories/track";
import { toTrackDto } from "../dtos/track";

export class TrackController {
  constructor(app: Application) {
    app.route("/track").get(this.getAll);
  }

  async getAll(req: Request, res: Response) {
    const page = parseInt(`${req.query.page || 0}`);
    const size = parseInt(`${req.query.size || 10}`);
    const skip = page * size;
    const trackMessages = await TrackModel.find({}, undefined, {
      limit: size,
      skip,
    });
    res.json(trackMessages.map(toTrackDto));
  }
}
