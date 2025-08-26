// Heurística simples: quebrar por parágrafos e montar blocos com overlap.
// maxChars ~ tamanho alvo; overlap garante contexto entre blocos.
export function chunkTextByParagraphs(
  raw: string,
  maxChars = 1800,
  overlap = 200
) {
  const text = (raw || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const paras = text.split(/\n{2,}/); // parágrafos = 1+ linhas
  const chunks: string[] = [];
  let current: string[] = [];
  let size = 0;

  for (const p of paras) {
    const pSize = p.length + 2; // +2 por quebra dupla
    if (size + pSize > maxChars && current.length > 0) {
      chunks.push(current.join("\n\n"));
      // overlap: reusa o final do chunk anterior para o próximo
      let carry = "";
      if (overlap > 0) {
        const prev = current.join("\n\n");
        carry = prev.slice(Math.max(0, prev.length - overlap));
      }
      current = carry ? [carry, p] : [p];
      size = current.join("\n\n").length;
    } else {
      current.push(p);
      size += pSize;
    }
  }
  if (current.length) chunks.push(current.join("\n\n"));
  return chunks;
}
