/**
 * Uložení / sdílení vytvořeného souboru z PWA na tabletu (rozhodnutí uživatele 2026-11-23):
 * „Sdílet“ = nabídka Androidu (e-mail, Disk…), když ji prohlížeč pro daný soubor dovolí; „Stáhnout“ = vždy,
 * do složky Stažené (jako záloha projektu).
 */

function fileOf(bytes: Uint8Array, name: string, type: string): File {
  return new File([bytes as BlobPart], name, { type });
}

/** Dovolí prohlížeč sdílet tento druh souboru? */
export function canShareFile(name: string, type: string): boolean {
  try {
    return typeof navigator !== 'undefined' && !!navigator.canShare && navigator.canShare({ files: [fileOf(new Uint8Array(1), name, type)] });
  } catch {
    return false;
  }
}

/** Sdílení přes nabídku systému; false = nešlo (zrušení uživatelem není chyba). */
export async function shareFile(bytes: Uint8Array, name: string, type: string): Promise<boolean> {
  const file = fileOf(bytes, name, type);
  if (!navigator.canShare?.({ files: [file] })) return false;
  try {
    await navigator.share({ files: [file], title: name });
    return true;
  } catch (e) {
    return (e as DOMException)?.name === 'AbortError';
  }
}

/** Stažení souboru (Stažené). */
export function downloadFile(bytes: Uint8Array, name: string, type: string): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
