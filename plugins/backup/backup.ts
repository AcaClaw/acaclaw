import { createHash } from "node:crypto";
import { access, copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { homedir } from "node:os";

export type BackupConfig = {
  backupDir: string;
  retentionDays: number;
  maxStorageGB: number;
  checksumAlgorithm: string;
  excludePatterns: string[];
  snapshotBeforeBatch: boolean;
};

export const DEFAULT_CONFIG: BackupConfig = {
  backupDir: join(homedir(), ".acaclaw", "backups"),
  retentionDays: 30,
  maxStorageGB: 10,
  checksumAlgorithm: "sha256",
  excludePatterns: ["*.tmp", "node_modules/", ".git/", "__pycache__/"],
  snapshotBeforeBatch: true,
};

export function resolveConfig(raw: Record<string, unknown> | undefined): BackupConfig {
  if (!raw) return { ...DEFAULT_CONFIG };
  return {
    backupDir:
      typeof raw.backupDir === "string" && raw.backupDir.trim()
        ? resolve(raw.backupDir)
        : DEFAULT_CONFIG.backupDir,
    retentionDays:
      typeof raw.retentionDays === "number" && raw.retentionDays > 0
        ? raw.retentionDays
        : DEFAULT_CONFIG.retentionDays,
    maxStorageGB:
      typeof raw.maxStorageGB === "number" && raw.maxStorageGB > 0
        ? raw.maxStorageGB
        : DEFAULT_CONFIG.maxStorageGB,
    checksumAlgorithm:
      typeof raw.checksumAlgorithm === "string" && raw.checksumAlgorithm.trim()
        ? raw.checksumAlgorithm
        : DEFAULT_CONFIG.checksumAlgorithm,
    excludePatterns: Array.isArray(raw.excludePatterns)
      ? raw.excludePatterns.filter((p): p is string => typeof p === "string")
      : DEFAULT_CONFIG.excludePatterns,
    snapshotBeforeBatch:
      typeof raw.snapshotBeforeBatch === "boolean"
        ? raw.snapshotBeforeBatch
        : DEFAULT_CONFIG.snapshotBeforeBatch,
  };
}

export type BackupMetadata = {
  originalPath: string;
  workspaceRelativePath: string;
  workspaceId: string;
  backupTime: string;
  operation: "modify" | "delete" | "rename";
  toolCall: string;
  agentSession: string;
  originalChecksum: string;
  originalSize: number;
  backupChecksum: string;
  description: string;
};

async function computeChecksum(filePath: string, algorithm: string): Promise<string> {
  const content = await readFile(filePath);
  const hash = createHash(algorithm).update(content).digest("hex");
  return `${algorithm}:${hash}`;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function formatTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

function formatDateDir(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function shouldExclude(filePath: string, patterns: string[]): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  for (const pattern of patterns) {
    if (pattern.endsWith("/")) {
      // Directory pattern
      if (normalized.includes(`/${pattern}`) || normalized.startsWith(pattern)) return true;
    } else if (pattern.startsWith("*.")) {
      // Extension pattern
      if (normalized.endsWith(pattern.slice(1))) return true;
    } else if (normalized.includes(pattern)) {
      return true;
    }
  }
  return false;
}

/**
 * Derive a stable workspace ID from the workspace root path.
 * Used to organize backups per workspace.
 */
function deriveWorkspaceId(workspaceDir: string): string {
  const absRoot = resolve(workspaceDir);
  const hash = createHash("sha256").update(absRoot).digest("hex").slice(0, 12);
  const dirName = basename(absRoot).replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${dirName}-${hash}`;
}

/**
 * Back up a file before modification. Returns the backup path on success.
 * Throws if the backup cannot be completed (blocks the write).
 *
 * When workspaceDir is provided, backups are organized per workspace:
 *   <backupDir>/<workspaceId>/files/<date>/<timestamp>.<filename>
 * Otherwise falls back to flat layout:
 *   <backupDir>/files/<date>/<timestamp>.<filename>
 */
export async function backupFile(
  originalPath: string,
  config: BackupConfig,
  context: { toolName: string; sessionId: string; workspaceDir?: string; description?: string },
): Promise<{ backupPath: string; metadataPath: string }> {
  const absPath = resolve(originalPath);

  if (shouldExclude(absPath, config.excludePatterns)) {
    return { backupPath: "", metadataPath: "" };
  }

  if (!(await fileExists(absPath))) {
    // File doesn't exist yet (new file creation) — nothing to back up
    return { backupPath: "", metadataPath: "" };
  }

  const now = new Date();
  const dateDir = formatDateDir(now);
  const timestamp = formatTimestamp(now);
  const fileName = basename(absPath);

  // Organize backups per workspace when workspace is known
  const wsId = context.workspaceDir ? deriveWorkspaceId(context.workspaceDir) : "_global";
  const backupDirForDate = join(config.backupDir, wsId, "files", dateDir);

  await mkdir(backupDirForDate, { recursive: true });

  const backupPath = join(backupDirForDate, `${timestamp}.${fileName}`);
  const metadataPath = `${backupPath}.meta.json`;

  // Copy the original file
  await copyFile(absPath, backupPath);

  // Compute checksums
  const originalChecksum = await computeChecksum(absPath, config.checksumAlgorithm);
  const backupChecksum = await computeChecksum(backupPath, config.checksumAlgorithm);

  // Verify integrity
  if (originalChecksum !== backupChecksum) {
    throw new Error(
      `Backup integrity check failed for ${absPath}: checksums do not match. Blocking file modification.`,
    );
  }

  const fileStat = await stat(absPath);

  // Store workspace-relative path for portability
  const workspaceRelativePath = context.workspaceDir
    ? relative(resolve(context.workspaceDir), absPath)
    : absPath;

  const metadata: BackupMetadata = {
    originalPath: absPath,
    workspaceRelativePath,
    workspaceId: wsId,
    backupTime: now.toISOString(),
    operation: "modify",
    toolCall: context.toolName,
    agentSession: context.sessionId,
    originalChecksum,
    originalSize: fileStat.size,
    backupChecksum,
    description: context.description ?? `Backed up before ${context.toolName} operation`,
  };

  await writeFile(metadataPath, JSON.stringify(metadata, null, 2));

  return { backupPath, metadataPath };
}

/**
 * List all backup versions of a specific file.
 * When workspaceDir is provided, searches that workspace's backup directory.
 * Otherwise searches all backup directories.
 */
export async function listBackups(
  originalPath: string,
  config: BackupConfig,
  workspaceDir?: string,
): Promise<BackupMetadata[]> {
  const { readdir } = await import("node:fs/promises");
  const absPath = resolve(originalPath);
  const results: BackupMetadata[] = [];

  // Determine which backup subdirs to search
  const searchDirs: string[] = [];
  if (workspaceDir) {
    const wsId = deriveWorkspaceId(workspaceDir);
    searchDirs.push(join(config.backupDir, wsId, "files"));
  } else {
    // Search all workspace subdirs
    try {
      const topLevel = await readdir(config.backupDir);
      for (const entry of topLevel) {
        const filesDir = join(config.backupDir, entry, "files");
        try {
          const s = await stat(filesDir);
          if (s.isDirectory()) searchDirs.push(filesDir);
        } catch {
          // not a workspace backup dir
        }
      }
    } catch {
      // Backup dir may not exist yet
    }
    // Also search legacy flat layout
    searchDirs.push(join(config.backupDir, "files"));
  }

  for (const filesDir of searchDirs) {
    try {
      const dateDirs = await readdir(filesDir);
      for (const dateDir of dateDirs) {
        const dirPath = join(filesDir, dateDir);
        const dirStat = await stat(dirPath);
        if (!dirStat.isDirectory()) continue;

        const files = await readdir(dirPath);
        for (const file of files) {
          if (!file.endsWith(".meta.json")) continue;
          const metaPath = join(dirPath, file);
          const metaContent = await readFile(metaPath, "utf-8");
          const meta: BackupMetadata = JSON.parse(metaContent);
          if (meta.originalPath === absPath) {
            results.push(meta);
          }
        }
      }
    } catch {
      // Backup dir may not exist yet
    }
  }
    }
  } catch {
    // Backup dir may not exist yet
  }

  return results.sort((a, b) => b.backupTime.localeCompare(a.backupTime));
}

/**
 * Restore a file from a specific backup.
 */
export async function restoreFile(
  backupPath: string,
  originalPath: string,
): Promise<void> {
  if (!(await fileExists(backupPath))) {
    throw new Error(`Backup file not found: ${backupPath}`);
  }
  const absOriginal = resolve(originalPath);
  await mkdir(dirname(absOriginal), { recursive: true });
  await copyFile(backupPath, absOriginal);
}
