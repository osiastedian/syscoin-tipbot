export class ApiError extends Error {
  static isApiError(err: unknown): err is ApiError {
    if (err === null || typeof err !== "object") {
      return false;
    }
    return "status" in err && "code" in err && "message" in err;
  }
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }

  toJson() {
    return {
      code: this.code,
      message: this.message,
    };
  }
}

export class NotFoundError extends ApiError {
  constructor(message?: string) {
    super(400, "NOT_FOUND", "Not found" ?? message);
  }
}
