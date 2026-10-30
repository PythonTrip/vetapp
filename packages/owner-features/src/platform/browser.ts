import type { OwnerPlatform } from "../platform";

export function createBrowserPlatform(navigate?: OwnerPlatform["navigate"]): OwnerPlatform {
  return {
    kind: "browser",
    navigate: navigate ?? ((path, replace) => {
      if (replace) window.location.replace(path);
      else window.location.assign(path);
    }),
    async saveFile(blob, filename) {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      try {
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
      } finally {
        anchor.remove();
        // Let the browser start reading the Blob before releasing it.
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    },
  };
}
