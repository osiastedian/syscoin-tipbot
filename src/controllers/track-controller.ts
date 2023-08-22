import { Request, Response, Application } from "express";
import { ITrack, TrackModel } from "../repositories/track";
import { toTrackDto } from "../dtos/track";
import { FilterQuery } from "mongoose";

export class TrackController {
  constructor(app: Application) {
    app.route("/track").get(this.getAll);
  }

  async getAll(req: Request, res: Response) {
    const filter: FilterQuery<ITrack> = {};
    const size = parseInt(`${req.query.size || 10}`);
    let page = 0;
    let createdAtSort = 1; // 1 for ascending, -1 for descending

    if (req.query.page) {
      if (req.query.page === "latest") {
        createdAtSort = -1;
      } else if (req.query.page === "oldest") {
        createdAtSort = 1;
      } else {
        page = parseInt(`${req.query.page}`);
      }
    }

    if (req.query.channelId) {
      filter.channelId = `${req.query.channelId}`;
    }

    const skip = page * size;
    const trackMessages = await TrackModel.find(filter)
      .sort({ createdAt: createdAtSort })
      .skip(skip)
      .limit(size);

    if (createdAtSort === -1) {
      trackMessages.reverse();
    }

    res.json(trackMessages.map(toTrackDto));
  }
}
