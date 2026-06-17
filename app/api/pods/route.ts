import { NextRequest, NextResponse } from "next/server";
import { podController } from "@/apps/api/src/api/controllers/pod.controller";
import { logger } from "@/apps/api/src/observability/logger/logger";

export async function GET(req: NextRequest) {
  try {
    const result = await podController.handle();
    return NextResponse.json(result);
  } catch (error: any) {
    logger.error({ error }, "api.pods.error");
    const code = error.code ?? "internal_error";
    const message = error.message ?? String(error);
    return NextResponse.json(
      {
        success: false,
        error: { code, message },
      },
      { status: 500 }
    );
  }
}
