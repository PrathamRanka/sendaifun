import { NextRequest, NextResponse } from "next/server";
import { chatController } from "@/apps/api/src/api/controllers/chat.controller";
import { logger } from "@/apps/api/src/observability/logger/logger";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await chatController.handle(body);
    return NextResponse.json(result);
  } catch (error: unknown) {
    logger.error({ error }, "api.chat.error");

    const err = error as { code?: string; message?: string; name?: string };
    const code = err.code ?? "internal_error";
    const message = err.message ?? String(error);
    const status =
      err.name === "ZodError"
        ? 400
        : err.name === "SandboxCapacityError"
        ? 503
        : 500;

    return NextResponse.json(
      {
        success: false,
        error: { code, message },
      },
      { status }
    );
  }
}
