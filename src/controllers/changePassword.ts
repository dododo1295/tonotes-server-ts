import { Response } from "../utils/response.ts";
import { userService } from "../config/serviceSetup.ts";
import { ChangePasswordRequest } from "../models/user.ts";
import { ChangeRateLimit } from "../utils/rateLimiter.ts";
import { RouterContext } from "@oak/oak";
import { ErrorCounter, HTTPMetrics } from "../utils/metrics.ts";

export async function changePassword(
  ctx: RouterContext<"/api/:userId/change-password">,
) {
  HTTPMetrics.track("PUT", "/change-password");

  const tokenUserId = ctx.state?.user?.userId;
  const paramUserId = ctx.params?.userId;

  if (!tokenUserId || !paramUserId || tokenUserId !== paramUserId) {
    ErrorCounter.add(1, {
      type: "auth",
      operation: "change_password_unauthorized",
    });
    return Response.unauthorized(
      ctx,
      "Missing or invalid Token",
    );
  }

  try {
    const body = await ctx.request.body.json();
    const req: ChangePasswordRequest = {
      oldPassword: body.oldPassword?.trim(),
      newPassword: body.newPassword?.trim(),
    };

    if (!req.newPassword || !req.oldPassword) {
      return Response.badRequest(
        ctx,
        "new or existing password not provided",
      );
    }

    const user = await userService.findById(tokenUserId);

    if (!user) {
      return Response.unauthorized(ctx, "User not found");
    }

    if (req.newPassword === req.oldPassword) {
      return Response.badRequest(ctx, "failed to provide a new password");
    }

    try {
      await userService.changePassword(
        user.userId,
        req.newPassword,
        req.oldPassword,
      );
    } catch (error) {
      if (error instanceof Error) {
        Response.badRequest(ctx, error.message);
      }
      throw error;
    }

    return Response.success(ctx, "Password successfully updated");
  } catch (error) {
    if (error instanceof ChangeRateLimit) {
      ErrorCounter.add(1, {
        type: "rate_limit",
        operation: "change_password",
      });
      return Response.tooManyRequests(
        ctx,
        `Trying to update too frequently: ${error.daysUntil}`,
      );
    }
    ErrorCounter.add(1, {
      type: "internal",
      operation: "change_password",
    });
    return Response.internalError(
      ctx,
      error instanceof Error ? error.message : "Error updating password",
    );
  }
}
