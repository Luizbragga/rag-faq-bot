// Gera uma resposta curta selecionando as sentenças mais relevantes dos trechos
export function makeExtractiveAnswer(
  query: string,
  texts: string[],
  maxSentences = 3
) {
  const q = query.toLowerCase();

  // Palavras-chave simples (remove stop-words comuns em pt/en)
  const stop = new Set([
    "de",
    "da",
    "do",
    "das",
    "dos",
    "e",
    "ou",
    "o",
    "a",
    "os",
    "as",
    "um",
    "uma",
    "para",
    "por",
    "no",
    "na",
    "nos",
    "nas",
    "em",
    "com",
    "se",
    "que",
    "é",
    "ser",
    "to",
    "the",
    "of",
    "and",
    "or",
    "in",
    "on",
    "for",
    "a",
    "an",
    "is",
    "are",
    "be",
  ]);
  const terms = q
    .replace(/[^\p{L}\p{N} ]+/gu, " ")
    .split(/\s+/)
    .filter((w) => w && !stop.has(w));

  const sentences = texts
    .join(" ")
    .split(/(?<=[\.\!\?])\s+|\n+/) // separa em sentenças
    .map((s) => s.trim())
    .filter((s) => s.length > 20 && s.length < 400);

  if (!sentences.length) {
    return "Não encontrei informação suficiente nos documentos.";
  }

  // score simples: quantos termos da consulta aparecem em cada sentença
  const scored = sentences.map((s) => {
    const ls = s.toLowerCase();
    let score = 0;
    for (const t of terms) {
      if (ls.includes(t)) score += 1;
    }
    // bônus se a sentença contiver “horário”, “prazo”, “política”, etc. (heurística útil p/ FAQ)
    if (/\b(hor[aá]rio|prazo|sla|pol[ií]tica|suporte|contato)\b/i.test(s))
      score += 0.5;
    return { s, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, maxSentences).map((x) => x.s);

  // Junta e dá um acabamento
  return top.join(" ");
}

// Cria um snippet resumido para exibir como citação
export function snippet(text: string, max = 220) {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : t.slice(0, max - 1) + "…";
}
