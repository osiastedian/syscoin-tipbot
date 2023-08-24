import { Client } from "discord.js";
import { Application, Request, Response } from "express";
import {
  IChannelConfiguration,
  isChannelConfiguration,
} from "../repositories/channel-configuration";

import bodyParser from "body-parser";
import { ChannelConfigurationService } from "../services/channel-configuration";
import { ApiError, NotFoundError } from "../utils/error";
import { toChannelConfigurationDto } from "../dtos/channel-configuration";

export class ChannelConfigurationController {
  private service: ChannelConfigurationService;
  constructor(private application: Application, private discordClient: Client) {
    this.service = new ChannelConfigurationService(this.discordClient);
    this.application
      .route("/channel-configuration")
      .get(this.getAll.bind(this));
    this.application
      .route("/channel-configuration")
      .post(bodyParser.json(), this.create.bind(this));
    this.application
      .route("/channel-configuration/:channelId")
      .delete(this.delete.bind(this));
    this.application
      .route("/channel-configuration/:channelId")
      .patch(bodyParser.json(), this.update.bind(this));
    this.application
      .route("/channel-configuration/:channelId")
      .get(bodyParser.json(), this.getOne.bind(this));
  }

  async getAll(req: Request, res: Response) {
    const configurations = await this.service.getAll();
    res.json(configurations.map(toChannelConfigurationDto));
  }

  async getOne(req: Request, res: Response) {
    const channelId = req.params.channelId;
    if (!channelId) {
      res.status(404).json({
        code: "NOT_FOUND",
        message: "Channel Configuration not found",
      });
    }
    try {
      const configuration = await this.service.getById(channelId);
      if (!configuration) {
        throw new NotFoundError("Channel configuration not found");
      }
      res.json(toChannelConfigurationDto(configuration));
    } catch (e) {
      if (ApiError.isApiError(e)) {
        res.status(e.status).json(e.toJson());
        return;
      }
      console.error(e);
      res.status(500).json({
        code: "UNKNOWN_ERROR",
        message: e.message ?? "Unknown error",
      });
    }
  }

  async create(req: Request, res: Response) {
    if (!isChannelConfiguration(req.body)) {
      res.status(500).json({
        code: "INVALID_CHANNEL_CONFIGURATION",
        message: "Invalid channel configuration",
      });
      return;
    }

    const data: IChannelConfiguration = {
      channelId: req.body.channelId,
      track: req.body.track,
    };

    try {
      const configuration = await this.service.create(data);
      res.status(200).json(toChannelConfigurationDto(configuration));
    } catch (apiError) {
      if (ApiError.isApiError(apiError)) {
        res.status(apiError.status).json(apiError.toJson());
        return;
      }
      console.error(apiError);
      res.status(500).json({
        code: "UNKNOWN_ERROR",
        message: "Unknown error",
      });
    }
  }

  async delete(req: Request, res: Response) {
    const channelId = req.params.channelId;
    if (!channelId) {
      res.status(400).json({
        code: "NOT_FOUND",
        message: "Channel Configuration not found",
      });
    }

    try {
      await this.service.delete(channelId);
      res.status(200).json(null);
    } catch (e) {
      if (ApiError.isApiError(e)) {
        res.status(e.status).json(e.toJson());
        return;
      }
      console.error(e);
      res.status(500).json({
        code: "UNKNOWN_ERROR",
        message: e.message ?? "Unknown error",
      });
    }
  }

  async update(req: Request, res: Response) {
    const channelId = req.params.channelId;
    if (!channelId) {
      res.status(400).json({
        code: "NOT_FOUND",
        message: "Channel Configuration not found",
      });
    }

    const data = req.body;
    if ("channelId" in data) {
      delete data.channelId;
    }
    try {
      const updatedConfiguration = await this.service.update(channelId, data);
      res.status(200).json(toChannelConfigurationDto(updatedConfiguration));
    } catch (e) {
      if (ApiError.isApiError(e)) {
        res.status(e.status).json(e.toJson());
        return;
      }
      console.error(e);
      res.status(500).json({
        code: "UNKNOWN_ERROR",
        message: e.message ?? "Unknown error",
      });
    }
  }
}
