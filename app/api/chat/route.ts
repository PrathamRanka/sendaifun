import { NextRequest, NextResponse } from "next/server";
import { chatController } from "@/apps/api/src/api/controllers/chat.controller";
import { logger } from "@/apps/api/src/observability/logger/logger";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await chatController.handle(body);
    return NextResponse.json(result);
  } catch (error: any) {
    logger.error({ error }, "api.chat.error");

    const code = error.code ?? "internal_error";
    const message = error.message ?? String(error);
    const status =
      error.name === "ZodError"
        ? 400
        : error.name === "SandboxCapacityError"
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
