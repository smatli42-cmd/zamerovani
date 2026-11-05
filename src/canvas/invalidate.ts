/**
 * Požadavek na překreslení plátna (plátno se kreslí jen když je potřeba – šetří baterii).
 * Oddělený modul, aby se nástroje a vykreslování navzájem neimportovaly.
 */
let handler: (() => void) | null = null;

export function setRenderHandler(fn: () => void): void {
  handler = fn;
}

export function requestRender(): void {
  handler?.();
}
