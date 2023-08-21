import { debug } from "../utils/log";

export abstract class BaseModule {
  abstract name: string;

  constructor() {
    console.log(`${this.getName()} Module Initialized`);
  }

  getName(): string {
    return this.name;
  }

  log(...args: any[]) {
    debug(`${this.getName()}: `, ...args);
  }
}
