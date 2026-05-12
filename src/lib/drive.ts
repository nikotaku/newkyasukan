export function driveImgUrl(idOrUrl: string | null | undefined, size = 800): string {
  if (!idOrUrl) return "";
  let id = idOrUrl.trim();
  // Already a direct HTTP(S) URL (not Google Drive) — use as-is
  if (id.startsWith("http") && !id.includes("drive.google.com")) return id;
  const fileMatch = id.match(/\/file\/d\/([^/?]+)/);
  if (fileMatch) return `https://drive.google.com/thumbnail?id=${fileMatch[1]}&sz=w${size}`;
  const idMatch = id.match(/[?&]id=([^&]+)/);
  if (idMatch) return `https://drive.google.com/thumbnail?id=${idMatch[1]}&sz=w${size}`;
  if (id.includes("drive.google.com/thumbnail")) return id;
  return `https://drive.google.com/thumbnail?id=${id.split("?")[0].split("/")[0]}&sz=w${size}`;
}
