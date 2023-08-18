import { Request, Response, Application } from "express";

export class TrackController {
  constructor(app: Application) {
    app.route("/track").get(this.getAll);
  }

  getAll(req: Request, res: Response) {
    res.send("Hello World!");
  }
}
