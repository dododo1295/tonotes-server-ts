import { ChangeEmailRequest } from "../models/user.ts";
import { UserService } from "../services/user.ts";
import { ErrorCounter, HTTPMetrics } from "../utils/metrics.ts";
import { ChangeRateLimit } from "../utils/rateLimiter.ts";
import { Response } from "../utils/response.ts";
import { Context } from "@oak/oak";

export async function changeEmail(ctx: Context) {
  HTTPMetrics.track("PUT", "/change-email");

  const userId = ctx.state.user?.userId;
  if (!userId) {
    ErrorCounter.add(1, {
      type: "auth",
      operation: "change_email_unauthorized",
    });
    return Response.unauthorized(ctx, "Missing or invalid Token");
  }

  try {
    const body = await ctx.request.body.json();
    const req: ChangeEmailRequest = {
      newEmail: body.newEmail?.trim(),
    };

    if (!req.newEmail) {
      return Response.badRequest(ctx, "New email not provided");
    }
    const userService = await UserService.initialize();

    const user = await userService.findById(userId);

    if (!user) {
      return Response.unauthorized(ctx, "User not found");
    }

    const update = await userService.updateEmail(user.userId, req.newEmail);
    if (!update) {
      return Response.internalError(ctx, "Failed to update email");
    }

    return Response.success(ctx, "User email has been updated");
  } catch (error) {
    if (error instanceof ChangeRateLimit) {
      ErrorCounter.add(1, {
        type: "rate_limit",
        operation: "change_email",
      });
      return Response.tooManyRequests(
        ctx,
        `Trying to update too frequently: ${error.daysUntil}`,
      );
    }
    ErrorCounter.add(1, {
      type: "internal",
      operation: "change_email",
    });
    return Response.internalError(
      ctx,
      error instanceof Error ? error.message : "Error updating email",
    );
  }
}
