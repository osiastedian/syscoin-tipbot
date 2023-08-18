export abstract class BaseModule {
  abstract name: string;

  constructor() {
    console.log(`${this.getName()} Module Initialized`);
  }

  getName(): string {
    return this.name;
  }

  log(...args: any[]) {
    console.log(`${this.getName()}: `, ...args);
  }
}
