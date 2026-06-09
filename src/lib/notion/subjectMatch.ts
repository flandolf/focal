import type { Subject } from "@/lib/types"
import { normaliseToken } from "@/lib/notion/schema"

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

function findSubjectIdFromText(value: string | undefined, subjects: Subject[]): string | undefined {
  if (!value) return undefined
  const normalized = normaliseToken(value)
  if (!normalized) return undefined

  const exact = subjects.find((subject) => (
    getSubjectAliases(subject).some((alias) => normaliseToken(alias) === normalized)
  ))
  if (exact) return exact.id

  return subjects.find((subject) => (
    getSubjectAliases(subject).some((alias) => {
      const normalizedAlias = normaliseToken(alias)
      return normalizedAlias.length >= 3 && normalized.includes(normalizedAlias)
    })
  ))?.id
}

export function findSubjectIdFromValues(values: string[], subjects: Subject[]): string | undefined {
  for (const value of values) {
    const subjectId = findSubjectIdFromText(value, subjects)
    if (subjectId) return subjectId
  }
  return undefined
}
