import type { Subject } from "@/lib/types"

function getSubjectAliases(subject: Subject): string[] {
  const base = [
    subject.id,
    subject.name,
    subject.shortCode,
    subject.name.replace(/\b(and|&)\b/gi, ""),
  ]
  const aliases: Record<string, string[]> = {
    mm: ["methods", "math methods", "maths methods", "mathematical methods"],
    sm: ["specialist", "specialist math", "specialist maths", "specialist mathematics"],
    gm: ["general", "general math", "general maths", "general mathematics"],
    eng: ["english"],
    "eng-lang": ["english language", "eng lang", "el"],
    csl: ["chinese", "chinese sl", "chinese second language"],
    pe: ["physical education", "phys ed", "sport"],
    bm: ["business", "business management"],
    bio: ["biology"],
    chem: ["chemistry"],
    phys: ["physics"],
    psych: ["psychology"],
    hist: ["history"],
    geo: ["geography"],
    econ: ["economics"],
    lit: ["literature"],
  }
  return [...base, ...(aliases[subject.id] ?? [])]
}

function normalisePhrase(value: string): string {
  return value.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim()
}

function findSubjectIdFromText(value: string | undefined, subjects: Subject[]): string | undefined {
  if (!value) return undefined
  const normalized = normalisePhrase(value)
  if (!normalized) return undefined

  const candidates = subjects.flatMap((subject) => getSubjectAliases(subject).map((alias) => ({
    subjectId: subject.id,
    alias: normalisePhrase(alias),
  })))
  const exact = candidates
    .filter((candidate) => candidate.alias === normalized)
    .sort((a, b) => a.subjectId.localeCompare(b.subjectId))[0]
  if (exact) return exact.subjectId

  const padded = ` ${normalized} `
  return candidates
    .filter((candidate) => candidate.alias.length >= 3 && padded.includes(` ${candidate.alias} `))
    .sort((a, b) => b.alias.length - a.alias.length || a.subjectId.localeCompare(b.subjectId))[0]
    ?.subjectId
}

export function findSubjectIdFromValues(values: string[], subjects: Subject[]): string | undefined {
  for (const value of values) {
    const subjectId = findSubjectIdFromText(value, subjects)
    if (subjectId) return subjectId
  }
  return undefined
}
