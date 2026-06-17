import { NextResponse } from "next/server";
import { podController } from "@/apps/api/src/api/controllers/pod.controller";
import { logger } from "@/apps/api/src/observability/logger/logger";

export async function GET() {
  try {
    const result = await podController.handle();
    return NextResponse.json(result);
  } catch (error) {
    logger.error({ error }, "api.pods.error");
    const err = error as { code?: string; message?: string };
    const code = err.code ?? "internal_error";
    const message = err.message ?? String(error);
    return NextResponse.json(
      {
        success: false,
        error: { code, message },
      },
      { status: 500 }
    );
  }
}
