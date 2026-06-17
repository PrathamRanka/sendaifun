import { NextRequest, NextResponse } from "next/server";
import { healthController } from "@/apps/api/src/api/controllers/health.controller";
import { logger } from "@/apps/api/src/observability/logger/logger";

export async function GET(req: NextRequest) {
  try {
    const result = await healthController.handle();
    return NextResponse.json(result);
  } catch (error: any) {
    logger.error({ error }, "api.health.error");
    return NextResponse.json(
      {
        ok: false,
        kubernetes: "disconnected",
        sandboxPodsReady: 0,
      },
      { status: 500 }
    );
  }
}
