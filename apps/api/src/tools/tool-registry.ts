import { ShellTool, shellTool } from "./implementations/shell.tool";
import { FsTool, fsTool } from "./implementations/fs.tool";
import { EnvTool, envTool } from "./implementations/env.tool";

export interface Tool {
  execute(podName: string, args: Record<string, unknown>): Promise<unknown>;
}

export class ToolRegistry {
  private readonly registry = new Map<string, Tool>();

  constructor(
    private readonly shellT: ShellTool = shellTool,
    private readonly fsT: FsTool = fsTool,
    private readonly envT: EnvTool = envTool
  ) {
    this.registerDefaults();
  }

  register(name: string, tool: Tool): void {
    this.registry.set(name, tool);
  }

  get(name: string): Tool | undefined {
    return this.registry.get(name);
  }

  private registerDefaults(): void {
    this.register("shell_run", {
      execute: async (podName, args) => {
        const command = args.command as string;
        if (!command) {
          throw new Error("Missing 'command' argument for shell_run");
        }
        return this.shellT.run(podName, command);
      },
    });
    this.register("shell.run", this.registry.get("shell_run")!);

    this.register("fs_read", {
      execute: async (podName, args) => {
        const path = args.path as string;
        if (!path) {
          throw new Error("Missing 'path' argument for fs_read");
        }
        return this.fsT.read(podName, path);
      },
    });
    this.register("fs.read", this.registry.get("fs_read")!);

    this.register("env_inspect", {
      execute: async (podName) => {
        return this.envT.inspect(podName);
      },
    });
    this.register("env.inspect", this.registry.get("env_inspect")!);
  }
}

export const toolRegistry = new ToolRegistry();
