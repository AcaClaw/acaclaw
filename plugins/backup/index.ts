import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/acaclaw-backup";
import { resolveConfig, backupFile, listBackups, restoreFile } from "./backup.js";

// Tools that modify files and need pre-backup
const FILE_WRITE_TOOLS = new Set([
  "write",
  "edit",
  "apply_patch",
  "bash",
  "exec",
  "process",
]);

const backupPlugin = {
  id: "acaclaw-backup",
  name: "AcaClaw Backup",
  description: "Automatic file backup before every modification — versioned and restorable",
  configSchema: {
    type: "object" as const,
    additionalProperties: false,
    properties: {},
  },

  register(api: OpenClawPluginApi) {
    const config = resolveConfig(api.pluginConfig as Record<string, unknown> | undefined);

    api.logger.info?.(`[acaclaw-backup] Backup dir: ${config.backupDir}`);

    // -------------------------------------------------------------------------
    // Hook: before_tool_call — back up files before modification
    // -------------------------------------------------------------------------
    api.on(
      "before_tool_call",
      async (event, ctx) => {
        if (!FILE_WRITE_TOOLS.has(event.toolName)) return;

        const params = event.params ?? {};
        const sessionId = ctx.sessionId ?? ctx.sessionKey ?? "unknown";
        const workspaceDir = ctx.workspaceDir;

        // Extract file path from tool params — different tools use different param names
        const targetPath = extractFilePath(event.toolName, params);

        if (!targetPath) return;

        try {
          const result = await backupFile(targetPath, config, {
            toolName: event.toolName,
            sessionId,
            workspaceDir,
          });

          if (result.backupPath) {
            api.logger.info?.(
              `[acaclaw-backup] Backed up ${targetPath} → ${result.backupPath}`,
            );
          }
        } catch (err) {
          // Backup failed — block the modification to protect user data
          api.logger.error?.(
            `[acaclaw-backup] Backup failed for ${targetPath}: ${err instanceof Error ? err.message : String(err)}`,
          );
          return {
            block: true,
            blockReason: `AcaClaw backup failed for ${targetPath}. File modification blocked to protect your data. Error: ${err instanceof Error ? err.message : String(err)}`,
          };
        }
      },
      { priority: 200 }, // High priority: backup runs before security checks
    );

    // -------------------------------------------------------------------------
    // Tool: backup_restore — restore a file from backup
    // -------------------------------------------------------------------------
    api.registerTool({
      name: "backup_restore",
      description:
        "Restore a file from a previous backup. Use this when the user wants to undo a change or recover a previous version of a file.",
      parameters: Type.Object({
        filePath: Type.String({
          description: "The original file path to restore",
        }),
        version: Type.Optional(
          Type.Number({
            description:
              "Which version to restore (0 = most recent backup, 1 = one before that, etc.). Default: 0",
          }),
        ),
      }),
      async execute(_id: string, params: { filePath: string; version?: number }) {
        const backups = await listBackups(params.filePath, config);

        if (backups.length === 0) {
          return `No backups found for ${params.filePath}`;
        }

        const versionIndex = params.version ?? 0;
        if (versionIndex < 0 || versionIndex >= backups.length) {
          return `Invalid version ${versionIndex}. Available versions: 0-${backups.length - 1}`;
        }

        const meta = backups[versionIndex];
        // Reconstruct backup path from metadata
        const date = meta.backupTime.slice(0, 10); // YYYY-MM-DD
        const time = new Date(meta.backupTime);
        const timestamp = `${String(time.getHours()).padStart(2, "0")}-${String(time.getMinutes()).padStart(2, "0")}-${String(time.getSeconds()).padStart(2, "0")}`;
        const fileName = meta.originalPath.split("/").pop() ?? "file";
        const wsId = meta.workspaceId ?? "_global";
        const backupPath = `${config.backupDir}/${wsId}/files/${date}/${timestamp}.${fileName}`;

        await restoreFile(backupPath, params.filePath);

        return `Restored ${params.filePath} from backup (${meta.backupTime}). Checksum: ${meta.originalChecksum}`;
      },
    });

    // -------------------------------------------------------------------------
    // Tool: backup_list — list backup versions of a file
    // -------------------------------------------------------------------------
    api.registerTool({
      name: "backup_list",
      description:
        "List all backup versions of a file. Shows when each backup was made, what tool triggered it, and file size.",
      parameters: Type.Object({
        filePath: Type.String({
          description: "The file path to check for backups",
        }),
      }),
      async execute(_id: string, params: { filePath: string }) {
        const backups = await listBackups(params.filePath, config);

        if (backups.length === 0) {
          return `No backups found for ${params.filePath}`;
        }

        const lines = backups.map((meta, i) => {
          const sizeKB = Math.round(meta.originalSize / 1024);
          return `[${i}] ${meta.backupTime} — ${sizeKB} KB — triggered by: ${meta.toolCall} — ${meta.description}`;
        });

        return `${backups.length} backup(s) for ${params.filePath}:\n${lines.join("\n")}`;
      },
    });

    // -------------------------------------------------------------------------
    // CLI: acaclaw backup commands
    // -------------------------------------------------------------------------
    api.registerCli(
      ({ program }) => {
        const backup = program.command("acaclaw-backup").description("AcaClaw file backup tools");

        backup
          .command("list <filePath>")
          .description("List backup versions of a file")
          .action(async (filePath: string) => {
            const backups = await listBackups(filePath, config);
            if (backups.length === 0) {
              console.log(`No backups found for ${filePath}`);
              return;
            }
            for (const [i, meta] of backups.entries()) {
              const sizeKB = Math.round(meta.originalSize / 1024);
              console.log(`[${i}] ${meta.backupTime}  ${sizeKB} KB  ${meta.toolCall}`);
            }
          });

        backup
          .command("restore <filePath>")
          .description("Restore a file from backup")
          .option("-v, --version <n>", "Version index (0 = most recent)", "0")
          .action(async (filePath: string, opts: { version: string }) => {
            const backups = await listBackups(filePath, config);
            const idx = parseInt(opts.version, 10);
            if (backups.length === 0) {
              console.error(`No backups found for ${filePath}`);
              process.exitCode = 1;
              return;
            }
            if (idx < 0 || idx >= backups.length) {
              console.error(`Invalid version ${idx}. Available: 0-${backups.length - 1}`);
              process.exitCode = 1;
              return;
            }
            const meta = backups[idx];
            const date = meta.backupTime.slice(0, 10);
            const time = new Date(meta.backupTime);
            const timestamp = `${String(time.getHours()).padStart(2, "0")}-${String(time.getMinutes()).padStart(2, "0")}-${String(time.getSeconds()).padStart(2, "0")}`;
            const fileName = meta.originalPath.split("/").pop() ?? "file";
            const wsId = meta.workspaceId ?? "_global";
            const backupPath = `${config.backupDir}/${wsId}/files/${date}/${timestamp}.${fileName}`;
            await restoreFile(backupPath, filePath);
            console.log(`Restored ${filePath} from backup (${meta.backupTime})`);
          });
      },
      { commands: ["acaclaw-backup"] },
    );
  },
};

/**
 * Extract the target file path from tool parameters.
 * Different tools use different parameter names.
 */
function extractFilePath(
  toolName: string,
  params: Record<string, unknown>,
): string | undefined {
  // Direct file path params
  if (typeof params.file_path === "string") return params.file_path;
  if (typeof params.filePath === "string") return params.filePath;
  if (typeof params.path === "string") return params.path;
  if (typeof params.target === "string") return params.target;

  // For exec/bash, try to extract file targets from the command
  if ((toolName === "bash" || toolName === "exec") && typeof params.command === "string") {
    return extractFileFromCommand(params.command);
  }

  return undefined;
}

/**
 * Best-effort extraction of file paths from shell commands.
 * Only catches obvious patterns — not a shell parser.
 */
function extractFileFromCommand(command: string): string | undefined {
  // Redirect: command > file.txt or command >> file.txt
  const redirectMatch = command.match(/>\s*(\S+)\s*$/);
  if (redirectMatch) return redirectMatch[1];

  // mv/cp target: mv source dest or cp source dest
  const mvCpMatch = command.match(/(?:mv|cp)\s+\S+\s+(\S+)\s*$/);
  if (mvCpMatch) return mvCpMatch[1];

  return undefined;
}

export default backupPlugin;
