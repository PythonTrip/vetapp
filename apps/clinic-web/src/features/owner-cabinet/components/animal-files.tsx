"use client";

import * as React from "react";
import { Button } from "@/shared/ui/button";
import { ownerError, ownerFiles, type OwnerFile } from "@/features/owner-cabinet/api";

const TYPE_LABELS: Record<string, string> = {
  "image/jpeg": "JPEG",
  "image/png": "PNG",
  "image/webp": "WebP",
  "image/gif": "GIF",
  "application/pdf": "PDF",
};

const TYPE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "application/pdf": ".pdf",
};

function formatBytes(size: number): string {
  if (size < 1024) return `${size} Б`;
  const kilobytes = size / 1024;
  if (kilobytes < 1024) return `${kilobytes < 10 ? kilobytes.toFixed(1) : Math.round(kilobytes)} КБ`;
  return `${(kilobytes / 1024).toFixed(1)} МБ`;
}

function downloadName(file: OwnerFile): string {
  const base = (file.caption || "файл").replace(/[\\/:*?"<>|]+/g, " ").trim() || "файл";
  const extension = TYPE_EXTENSIONS[file.content_type] ?? "";
  return extension && !base.toLowerCase().endsWith(extension) ? `${base}${extension}` : base;
}

function LinkedFiles({ animalId }: { animalId: string }) {
  const [files, setFiles] = React.useState<OwnerFile[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [downloading, setDownloading] = React.useState<string | null>(null);
  const generation = React.useRef(0);
  const load = React.useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    setError("");
    try {
      const result = await ownerFiles.list(animalId);
      if (current === generation.current) setFiles(result);
    } catch (cause) {
      if (current === generation.current) setError(ownerError(cause));
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [animalId]);
  React.useEffect(() => {
    void load();
    return () => {
      generation.current += 1;
    };
  }, [load]);
  async function download(file: OwnerFile) {
    if (downloading) return;
    setDownloading(file.uuid);
    setError("");
    try {
      const blob = await ownerFiles.download(file.uuid);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = downloadName(file);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(ownerError(cause));
    } finally {
      setDownloading(null);
    }
  }
  return (
    <section className="min-w-0 space-y-2">
      <h4 className="font-semibold">Файлы</h4>
      {loading && <p role="status" className="text-sm">Загрузка файлов…</p>}
      {error && (
        <div className="space-y-2">
          <p role="alert" className="break-words text-sm text-destructive">{error}</p>
          <Button type="button" variant="outline" className="w-full" disabled={loading || downloading !== null} onClick={() => void load()}>Повторить загрузку</Button>
        </div>
      )}
      {!loading && !error && files.length === 0 && <p className="text-sm text-muted-foreground">Врач пока не открыл файлы</p>}
      <ul className="space-y-3">
        {files.map((file) => (
          <li key={file.uuid} className="min-w-0 space-y-2 rounded-md border p-3">
            <p className="break-words font-medium">{file.caption || "Без подписи"}</p>
            <p className="break-words text-xs text-muted-foreground">
              {new Date(file.created_at).toLocaleString("ru-RU")}
              {" · "}
              {TYPE_LABELS[file.content_type] ?? file.content_type}
              {" · "}
              {formatBytes(file.byte_size)}
            </p>
            <Button type="button" variant="outline" className="w-full" disabled={downloading !== null} onClick={() => void download(file)}>
              {downloading === file.uuid ? "Скачивание…" : "Скачать"}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function AnimalFiles({ animalId, linked }: { animalId: string; linked: boolean }) {
  if (!linked) {
    return (
      <section className="min-w-0 space-y-2">
        <h4 className="font-semibold">Файлы</h4>
        <p className="text-sm text-muted-foreground">Файлы появятся, когда врач примет регистрацию</p>
      </section>
    );
  }
  return <LinkedFiles animalId={animalId} />;
}
